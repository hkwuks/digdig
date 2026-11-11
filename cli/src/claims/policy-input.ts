import { createHash } from 'crypto';
import { bodyVersionId } from '../deep/session-db.js';
import { getApprovedResults } from '../deep/session.js';
import { loadSourceRelations } from './source-relations.js';
import type { Claim, EvidenceSpan, Verdict } from './types.js';
import type { PolicyInput } from './policy.js';

export function policyInput(sessionDir: string, claim: Claim, evidences: EvidenceSpan[], verdicts: Verdict[]): PolicyInput {
  const results = new Map(getApprovedResults(sessionDir).map(result => [result.id, result]));
  const valid = evidences.filter(item => {
    const result = results.get(item.resultId);
    if (item.claimId !== claim.id || item.invalid || !result?.content || item.snapshotId !== bodyVersionId(result.id, result.content)) return false;
    const quote = result.content.slice(item.charStart, item.charEnd);
    return item.charStart >= 0 && item.charEnd > item.charStart && item.charEnd <= result.content.length && quote === item.quote
      && createHash('sha256').update(quote).digest('hex') === item.contentHash;
  });
  const ids = new Set(valid.map(item => item.id));
  const filtered = verdicts.filter(item => item.claimId === claim.id).map(item => ({ ...item, evidenceIds: item.evidenceIds.filter(id => ids.has(id)) })).filter(item => item.evidenceIds.length);
  return { claimId: claim.id, riskLevel: claim.riskLevel, evidences: valid, verdicts: filtered, relations: loadSourceRelations(sessionDir, claim.id) };
}
