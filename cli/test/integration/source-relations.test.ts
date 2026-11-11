import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { appendSessionResults, approveAndInjectResults, initSessionDir, loadSessionResults, recordExtractionOutcome } from '../../src/deep/session.js';
import { loadEvidences, saveClaims, saveEvidences } from '../../src/claims/store.js';
import { bodyVersionId } from '../../src/deep/session-db.js';
import { runSourceRelations } from '../../src/commands/source-relations.js';
import { runEvidenceVerify } from '../../src/commands/evidence.js';
import { runPolicyAggregate } from '../../src/commands/review.js';
import { loadReviews, loadReviewHistory } from '../../src/claims/store.js';

describe('source relationship records', () => {
  let dir: string;
  let ids: Array<{ resultId: string; snapshotId: string }>;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dg-source-rel-'));
    initSessionDir(dir);
    appendSessionResults(dir, ['a', 'b', 'c'].map(name => ({ url: `https://example.com/${name}`, title: name, contentType: 'extracted' as const, content: `body ${name}`, extractor: 'test', extractedAt: 1, origins: [] })));
    const results = loadSessionResults(dir);
    approveAndInjectResults(dir, results.map(result => ({ id: result.id, revision: result.revision })));
    ids = results.map(result => ({ resultId: result.id, snapshotId: bodyVersionId(result.id, result.content!) }));
    saveClaims(dir, [{ id: 'c1', text: 'claim', riskLevel: 'high', status: 'verifying', sessionDir: dir, createdAt: 1 }]);
    saveEvidences(dir, ids.map((item, i) => ({ id: `e${i}`, claimId: 'c1', ...item, quote: 'body', charStart: 0, charEnd: 4, contentHash: createHash('sha256').update('body').digest('hex'), extractedAt: 1 })));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); rmSync(dir, { recursive: true, force: true }); });

  function input(data: object): string {
    const file = join(dir, 'agent-inputs', 'source-relation.json');
    writeFileSync(file, JSON.stringify(data));
    return file;
  }

  it('records judgments, rejects contradictory transitive claims, and preserves revoked history', async () => {
    expect(await runSourceRelations(dir, { claimId: 'c1', dataFile: input({ action: 'record', left: ids[0], right: ids[1], relation: ['same'], reason: 'invalid type' }) })).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0]).error.code).toBe('INVALID_SOURCE_RELATION');
    const record = async (a: number, b: number, relation: string) => runSourceRelations(dir, { claimId: 'c1', dataFile: input({ action: 'record', left: ids[a], right: ids[b], relation, reason: 'verified source chain' }) });
    expect(await record(0, 1, 'same')).toBe(0);
    expect(await record(1, 2, 'same')).toBe(0);
    expect(await record(0, 2, 'independent')).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0]).error.code).toBe('SOURCE_RELATION_CONFLICT');
    expect(await runSourceRelations(dir, { claimId: 'c1' })).toBe(0);
    const relations = JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data.relations;
    expect(relations).toHaveLength(2);
    expect(await runSourceRelations(dir, { claimId: 'c1', dataFile: input({ action: 'revoke', id: relations[0].id, reason: 'incorrect provenance' }) })).toBe(0);
    expect(await runSourceRelations(dir, { claimId: 'c1' })).toBe(0);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data.relations).toContainEqual(expect.objectContaining({ id: relations[0].id, invalidationReason: 'incorrect provenance' }));
  });

  it('invalidates the judgment when a bound body changes', async () => {
    expect(await runSourceRelations(dir, { claimId: 'c1', dataFile: input({ action: 'record', left: ids[0], right: ids[1], relation: 'independent', reason: 'independent interviews' }) })).toBe(0);
    recordExtractionOutcome(dir, [{ url: 'https://example.com/a', content: 'updated body', extractor: 'test', extractedAt: 2 }]);
    expect(await runSourceRelations(dir, { claimId: 'c1' })).toBe(0);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data.relations[0]).toMatchObject({ invalidationReason: 'snapshot_changed' });
  });

  it('returns identical captured text as a hint, without declaring same-source', async () => {
    recordExtractionOutcome(dir, [{ url: 'https://example.com/b', content: 'body a', extractor: 'test', extractedAt: 2 }]);
    const b = loadSessionResults(dir)[1];
    approveAndInjectResults(dir, [{ id: b.id, revision: b.revision }]);
    const evidence = loadEvidences(dir);
    evidence[1] = { ...evidence[1], snapshotId: bodyVersionId(b.id, 'body a'), invalid: false, quote: 'body', charStart: 0, charEnd: 4 };
    saveEvidences(dir, evidence);
    expect(await runSourceRelations(dir, { claimId: 'c1' })).toBe(0);
    const data = JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data;
    expect(data.hints).toContainEqual(expect.objectContaining({ kind: 'identical_capture' }));
    expect(data.relations).toEqual([]);
  });

  it('uses the same judgments for both review commands and retains revoked reviews', async () => {
    const verify = (index: number, complete = false) => runEvidenceVerify(dir, { claimId: 'c1', evidenceFile: input({ resultId: ids[index].resultId, quote: 'body', charStart: 0, charEnd: 4 }), stance: 'support', reason: 'verified', complete });
    expect(await verify(0)).toBe(0);
    expect(await verify(1, true)).toBe(0);
    expect(loadReviews(dir)[0]).toMatchObject({ decision: 'needsReview', checks: { sourceIndependence: 'unknown' } });
    expect(await runSourceRelations(dir, { claimId: 'c1', dataFile: input({ action: 'record', left: ids[0], right: ids[1], relation: 'independent', reason: 'separate original interviews' }) })).toBe(0);
    expect(await runPolicyAggregate(dir, { claimId: 'c1' })).toBe(0);
    expect(loadReviews(dir)[0]).toMatchObject({ decision: 'approved', autoPass: true });
    expect(await verify(1, true)).toBe(0);
    expect(loadReviews(dir)[0]).toMatchObject({ decision: 'approved', autoPass: true });
    const id = JSON.parse(vi.mocked(console.log).mock.calls.findLast(call => String(call[0]).includes('relations'))![0]).data.relations[0].id;
    expect(await runSourceRelations(dir, { claimId: 'c1', dataFile: input({ action: 'revoke', id, reason: 'new provenance' }) })).toBe(0);
    expect(loadReviews(dir)).toHaveLength(0);
    expect(loadReviewHistory(dir).some(item => item.decision === 'approved')).toBe(true);
  });
});
