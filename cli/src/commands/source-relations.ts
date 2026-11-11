import { randomUUID } from 'crypto';
import { bodyVersionId } from '../deep/session-db.js';
import { getApprovedResults, mutateSessionState, resolveSessionPath } from '../deep/session.js';
import { withSessionWrite } from '../deep/session-store.js';
import { loadClaims, loadEvidences, loadReviews, saveClaims, saveReviews } from '../claims/store.js';
import { loadSourceRelations, relationsConflict } from '../claims/source-relations.js';
import type { SourceRelation } from '../claims/types.js';
import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { isJsonObject, readSessionJsonInput } from './json-input.js';
import { policyInput } from '../claims/policy-input.js';
import { tokenize, jaccardSimilarity } from '../claims/deterministic-checks.js';

class RelationError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

export async function runSourceRelations(session: string, options: { claimId: string; dataFile?: string }): Promise<number> {
  const dir = resolveSessionPath(session);
  let data: Record<string, unknown> | undefined;
  if (options.dataFile !== undefined) {
    const input = readSessionJsonInput(dir, [{ option: '--data-file', value: options.dataFile, file: true }]);
    if (!input.ok) { console.log(JSON.stringify(createErrorEnvelope(input.code, input.message))); return 1; }
    if (!isJsonObject(input.value)) { console.log(JSON.stringify(createErrorEnvelope('INVALID_SOURCE_RELATION', 'Input must be an object'))); return 1; }
    data = input.value;
  }
  try {
    // Reading first avoids creating an absent session for either operation.
    if (!loadClaims(dir).some(item => item.id === options.claimId)) throw new RelationError('CLAIM_NOT_FOUND', `Claim ${options.claimId} not found`);
    if (data) mutateSessionState(dir, () => {
      const claims = loadClaims(dir);
      const claim = claims.find(item => item.id === options.claimId)!;
      const relations = loadSourceRelations(dir, claim.id);
      if (typeof data!.reason !== 'string' || !data!.reason.trim()) throw new RelationError('INVALID_SOURCE_RELATION', 'A nonempty reason is required');
      if (data!.action === 'record') {
        if (!isJsonObject(data!.left) || !isJsonObject(data!.right) || typeof data!.relation !== 'string' || !['same', 'independent'].includes(data!.relation)) throw new RelationError('INVALID_SOURCE_RELATION', 'Provide two sources and relation same or independent');
        const sides = [data!.left, data!.right];
        if (sides.some(side => typeof side.resultId !== 'string' || typeof side.snapshotId !== 'string') || sides[0].resultId === sides[1].resultId) throw new RelationError('INVALID_SOURCE_RELATION', 'Two distinct result IDs and snapshot IDs are required');
        const approved = getApprovedResults(dir);
        const evidence = policyInput(dir, claim, loadEvidences(dir), []).evidences;
        for (const side of sides) {
          const result = approved.find(item => item.id === side.resultId);
          if (!result?.content || bodyVersionId(result.id, result.content) !== side.snapshotId || !evidence.some(item => item.claimId === claim.id && !item.invalid && item.resultId === result.id && item.snapshotId === side.snapshotId)) throw new RelationError('INVALID_SOURCE_RELATION', 'Sources must have current approved snapshots and valid claim evidence');
        }
        sides.sort((a, b) => String(a.resultId).localeCompare(String(b.resultId)));
        const candidate: SourceRelation = { id: randomUUID(), claimId: claim.id, leftResultId: String(sides[0].resultId), rightResultId: String(sides[1].resultId), leftSnapshotId: String(sides[0].snapshotId), rightSnapshotId: String(sides[1].snapshotId), relation: data!.relation as SourceRelation['relation'], reason: data!.reason as string, createdAt: Date.now() };
        const existing = relations.find(item => item.invalidatedAt === undefined && item.leftResultId === candidate.leftResultId && item.rightResultId === candidate.rightResultId && item.leftSnapshotId === candidate.leftSnapshotId && item.rightSnapshotId === candidate.rightSnapshotId);
        if (existing) {
          if (existing.relation === candidate.relation && existing.reason === candidate.reason) return;
          throw new RelationError('SOURCE_RELATION_CONFLICT', 'Revoke the existing judgment before recording a replacement');
        }
        if (relationsConflict([...relations, candidate])) throw new RelationError('SOURCE_RELATION_CONFLICT', 'Judgment contradicts existing source relationships');
        withSessionWrite(dir, db => db.prepare('INSERT INTO source_relations (id, claim_id, left_result_id, right_result_id, left_snapshot_id, right_snapshot_id, relation, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(candidate.id, candidate.claimId, candidate.leftResultId, candidate.rightResultId, candidate.leftSnapshotId, candidate.rightSnapshotId, candidate.relation, candidate.reason, candidate.createdAt));
      } else if (data!.action === 'revoke' && typeof data!.id === 'string') {
        const existing = relations.find(item => item.id === data!.id);
        if (!existing) throw new RelationError('SOURCE_RELATION_NOT_FOUND', 'Active judgment not found');
        if (existing.invalidatedAt !== undefined) {
          if (existing.invalidationReason === data!.reason) return;
          throw new RelationError('SOURCE_RELATION_CONFLICT', 'Judgment is already invalidated');
        }
        withSessionWrite(dir, db => db.prepare('UPDATE source_relations SET invalidated_at = ?, invalidation_reason = ? WHERE id = ?').run(Date.now(), data!.reason as string, existing.id));
      } else throw new RelationError('INVALID_SOURCE_RELATION', 'Action must be record or revoke');
      saveReviews(dir, loadReviews(dir).filter(item => item.claimId !== claim.id));
      claim.status = loadEvidences(dir).some(item => item.claimId === claim.id && !item.invalid) ? 'verifying' : 'pending';
      saveClaims(dir, claims);
    });
    const claim = loadClaims(dir).find(item => item.id === options.claimId)!;
    const evidence = policyInput(dir, claim, loadEvidences(dir), []).evidences;
    const ids = new Set(evidence.map(item => item.resultId));
    const sources = getApprovedResults(dir).filter(item => ids.has(item.id));
    const hints: Array<{ leftResultId: string; rightResultId: string; similarity: number; kind: string }> = [];
    let pairs = 0;
    // shortcut: compare at most 100 pairs and 100k characters per body; paginate comparisons if larger sessions need complete hints.
    const tokens = sources.slice(0, 101).map(item => new Set(tokenize(item.content!.slice(0, 100_000))));
    outer: for (let i = 0; i < sources.length; i++) for (let j = i + 1; j < sources.length; j++) {
      if (pairs++ >= 100) break outer;
      const same = sources[i].content === sources[j].content;
      const similarity = same ? 1 : jaccardSimilarity(tokens[i], tokens[j]);
      if (same || similarity >= 0.3) hints.push({ leftResultId: sources[i].id, rightResultId: sources[j].id, similarity, kind: same ? 'identical_capture' : 'similar_capture' });
    }
    console.log(JSON.stringify(createSuccessEnvelope({ relations: loadSourceRelations(dir, options.claimId), hints, hintsTruncated: sources.length * (sources.length - 1) / 2 > 100 || sources.some(item => item.content!.length > 100_000) }), null, 2));
    return 0;
  } catch (error) {
    if (!(error instanceof RelationError)) throw error;
    console.log(JSON.stringify(createErrorEnvelope(error.code, error.message), null, 2));
    return 1;
  }
}
