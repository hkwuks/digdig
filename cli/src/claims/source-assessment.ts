import type { EvidenceSpan, SourceRelation, Verdict } from './types.js';

export type IndependenceState = 'independent' | 'same' | 'unknown' | 'insufficient' | 'conflict';

export interface SourceAssessment {
  state: IndependenceState;
  supportedSources: number;
  reason: string;
}

function key(resultId: string, snapshotId: string): string {
  return JSON.stringify([resultId, snapshotId]);
}

/** Evaluate explicit judgments only; unrelated domains never imply independence. */
export function assessSources(claimId: string, evidences: EvidenceSpan[], verdicts: Verdict[], relations: SourceRelation[]): SourceAssessment {
  const supportedIds = new Set(verdicts.filter(verdict => verdict.claimId === claimId && verdict.stance === 'support').flatMap(verdict => verdict.evidenceIds));
  const supported = evidences.filter(item => item.claimId === claimId && !item.invalid && supportedIds.has(item.id));
  if (supported.some(item => !item.snapshotId)) return { state: 'unknown', supportedSources: 0, reason: 'A supported evidence has no verified snapshot' };
  const keys = [...new Set(supported.map(item => key(item.resultId, item.snapshotId!)))];
  if (keys.length < 2) return { state: 'insufficient', supportedSources: keys.length, reason: 'Fewer than two supported sources' };
  const parent = new Map(keys.map(value => [value, value]));
  function root(value: string): string {
    while (parent.get(value) !== value) value = parent.get(value)!;
    return value;
  }
  const active = relations.filter(item => item.claimId === claimId && item.invalidatedAt === undefined
    && parent.has(key(item.leftResultId, item.leftSnapshotId)) && parent.has(key(item.rightResultId, item.rightSnapshotId)));
  for (const item of active) {
    if (item.relation !== 'same') continue;
    const left = root(key(item.leftResultId, item.leftSnapshotId));
    const right = root(key(item.rightResultId, item.rightSnapshotId));
    parent.set(left, right);
  }
  const independent = new Set<string>();
  for (const item of active) {
    if (item.relation !== 'independent') continue;
    const left = root(key(item.leftResultId, item.leftSnapshotId));
    const right = root(key(item.rightResultId, item.rightSnapshotId));
    if (left === right) return { state: 'conflict', supportedSources: 1, reason: 'Conflicting same-source and independent judgments' };
    independent.add(JSON.stringify([left, right].sort()));
  }
  const groups = [...new Set(keys.map(root))];
  if (groups.length === 1) return { state: 'same', supportedSources: 1, reason: 'All supported evidence comes from the same source' };
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (!independent.has(JSON.stringify([groups[i], groups[j]].sort()))) return { state: 'unknown', supportedSources: groups.length, reason: 'Source independence is unknown; Agent review required' };
    }
  }
  return { state: 'independent', supportedSources: groups.length, reason: 'Supported sources were explicitly confirmed independent' };
}
