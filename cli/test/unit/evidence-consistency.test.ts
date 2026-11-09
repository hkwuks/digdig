import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runEvidenceVerify } from '../../src/commands/evidence.js';

const state = vi.hoisted(() => ({
  claims: [] as any[], evidences: [] as any[], verdicts: [] as any[], reviews: [] as any[],
}));
vi.mock('../../src/deep/session.js', () => ({
  resolveSessionPath: () => 'session', initSessionDir: vi.fn(),
  mutateSessionState: (_: unknown, f: () => unknown) => f(),
  getApprovedResults: () => [{ id: 'r1', url: 'https://a.test', content: 'hello', extractedAt: 1 }],
}));
vi.mock('../../src/commands/json-input.js', () => ({
  isJsonObject: (v: unknown) => !!v && typeof v === 'object',
  readSessionJsonInput: () => ({ ok: true, value: { resultId: 'r1', quote: 'hello', charStart: 0, charEnd: 5 } }),
}));
vi.mock('../../src/claims/store.js', () => ({
  ClaimsStateError: class extends Error {}, assertClaimsStoreReadable: vi.fn(),
  loadClaims: () => state.claims, loadEvidences: () => state.evidences,
  loadVerdicts: () => state.verdicts, loadReviews: () => state.reviews,
  saveClaims: (v: unknown, data: any[]) => { state.claims = data; },
  saveEvidences: (v: unknown, data: any[]) => { state.evidences = data; },
  saveVerdicts: (v: unknown, data: any[]) => { state.verdicts = data; },
  saveReviews: (v: unknown, data: any[]) => { state.reviews = data; },
}));

describe('evidence verdict consistency', () => {
  beforeEach(() => {
    state.claims = [{ id: 'c1', status: 'reviewed', riskLevel: 'medium' }];
    state.evidences = [{ id: 'e1', claimId: 'c1', resultId: 'r1', quote: 'hello', charStart: 0, charEnd: 5, resultUrl: 'https://a.test' }];
    state.verdicts = [{ id: 'v1', claimId: 'c1', evidenceIds: ['e1'], stance: 'support', reason: 'old', confidence: 0.9 }];
    state.reviews = [{ claimId: 'c1', decision: 'approved' }, { claimId: 'other', decision: 'approved' }];
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  it('updates the existing verdict and removes only its stale review', async () => {
    expect(await runEvidenceVerify('session', { claimId: 'c1', stance: 'refute', reason: 'new', confidence: 0.7 })).toBe(0);
    expect(state.verdicts).toMatchObject([{ id: 'v1', stance: 'refute', reason: 'new', confidence: 0.7 }]);
    expect(state.claims[0].status).toBe('verifying');
    expect(state.reviews.map(r => r.claimId)).toEqual(['other']);
  });
  it('invalidates an old review when adding a new verdict', async () => {
    state.evidences = [];
    state.verdicts = [];
    expect(await runEvidenceVerify('session', { claimId: 'c1', stance: 'support', reason: 'new' })).toBe(0);
    expect(state.verdicts).toHaveLength(1);
    expect(state.reviews.map(r => r.claimId)).toEqual(['other']);
    expect(state.claims[0].status).toBe('verifying');
  });
  it('keeps a review on an unchanged retry', async () => {
    expect(await runEvidenceVerify('session', { claimId: 'c1', stance: 'support', reason: 'old', confidence: 0.9 })).toBe(0);
    expect(state.reviews).toHaveLength(2);
    expect(state.claims[0].status).toBe('reviewed');
  });
  it('recomputes the review on complete', async () => {
    expect(await runEvidenceVerify('session', { claimId: 'c1', stance: 'refute', reason: 'new', complete: true })).toBe(0);
    expect(state.reviews.find(r => r.claimId === 'c1')).toMatchObject({ decision: 'needsReview', matchedRule: 'singleRefute' });
    expect(state.claims[0].status).toBe('reviewed');
  });
});
