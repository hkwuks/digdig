import { describe, expect, it } from 'vitest';
import { aggregateClaim } from '../../src/claims/policy.js';
import type { EvidenceSpan, Verdict, SourceRelation } from '../../src/claims/types.js';

const evidence = (id: string, cluster: string): EvidenceSpan => ({
  id, claimId: 'c1', resultId: `r${id}`, resultUrl: `https://${cluster}.example/article`,
  quote: 'same report', charStart: 0, charEnd: 11, contentHash: 'hash', extractedAt: 1,
  snapshotId: `s${id}`, sourceClusterId: cluster,
});
const support = (id: string): Verdict => ({ id: `v${id}`, claimId: 'c1', evidenceIds: [id], stance: 'support', reason: 'test', createdAt: 1 });
const independent = (a: EvidenceSpan, b: EvidenceSpan): SourceRelation => ({ id: 'rel1', claimId: 'c1', leftResultId: a.resultId, rightResultId: b.resultId, leftSnapshotId: a.snapshotId!, rightSnapshotId: b.snapshotId!, relation: 'independent', reason: 'independent original reports', createdAt: 1 });

describe('source independence safety', () => {
  it('does not automatically approve two domains when source independence is unknown', () => {
    const a = evidence('1', 'a');
    const b = evidence('2', 'b');
    expect(aggregateClaim({ claimId: 'c1', riskLevel: 'high', evidences: [a, b], verdicts: [support(a.id), support(b.id)] }).decision).toBe('needsReview');
  });

  it('does not count a source with no supporting verdict towards automatic approval', () => {
    const a = evidence('1', 'a');
    const b = evidence('2', 'b');
    expect(aggregateClaim({ claimId: 'c1', riskLevel: 'high', evidences: [a, b], verdicts: [support(a.id)], relations: [independent(a, b)] }).decision).toBe('needsReview');
  });

  it('approves only when both supported sources are explicitly independent for these snapshots', () => {
    const a = evidence('1', 'a'); const b = evidence('2', 'b');
    const input = { claimId: 'c1', riskLevel: 'high' as const, evidences: [a, b], verdicts: [support(a.id), support(b.id)] };
    expect(aggregateClaim({ ...input, relations: [independent(a, b)] }).decision).toBe('approved');
    expect(aggregateClaim({ ...input, relations: [{ ...independent(a, b), leftSnapshotId: 'old' }] }).decision).toBe('needsReview');
    expect(aggregateClaim({ ...input, relations: [{ ...independent(a, b), claimId: 'other' }] }).decision).toBe('needsReview');
  });

  it('does not infer independence transitively or from an invalidated judgment', () => {
    const a = evidence('1', 'same'); const b = evidence('2', 'same'); const c = evidence('3', 'same');
    const input = { claimId: 'c1', riskLevel: 'high' as const, evidences: [a, b, c], verdicts: [support(a.id), support(b.id), support(c.id)] };
    expect(aggregateClaim({ ...input, relations: [independent(a, b), independent(b, c)] }).checks.sourceIndependence).toBe('unknown');
    expect(aggregateClaim({ ...input, relations: [independent(a, b), independent(b, c), { ...independent(a, c), invalidatedAt: 2 }] }).decision).toBe('needsReview');
    expect(aggregateClaim({ ...input, relations: [independent(a, b), independent(b, c), independent(a, c)] }).decision).toBe('approved');
  });
});
