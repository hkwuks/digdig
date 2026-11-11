import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createHash } from 'crypto';
import { appendSessionResults, approveAndInjectResults, initSessionDir, loadSessionGraph, loadSessionResults, listPendingGraph, mutateSessionGraph, recordExtractionOutcome } from '../../src/deep/session.js';
import { withSessionWrite } from '../../src/deep/session-store.js';
import { runGraphObfuscateCommand } from '../../src/commands/graph-obfuscate.js';
import { runGraphAdd } from '../../src/commands/graph-add.js';
import { runEvidenceVerify } from '../../src/commands/evidence.js';
import { runReviewList } from '../../src/commands/review.js';
import { loadClaims, loadEvidences, loadReviews, loadVerdicts, saveClaims, saveEvidences } from '../../src/claims/store.js';
import { bodyVersionId } from '../../src/deep/session-db.js';

describe('SQLite-backed session integration', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dg-session-sqlite-')); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('stores new session state in SQLite without creating legacy JSON', () => {
        initSessionDir(dir);
        appendSessionResults(dir, [{ url: 'https://example.com', title: 'Example', origins: [{ tool: 'test', query: 'q' }] }]);
        expect(loadSessionResults(dir)).toHaveLength(1);
        expect(existsSync(join(dir, 'session.sqlite'))).toBe(true);
        expect(existsSync(join(dir, 'results.json'))).toBe(false);
        expect(existsSync(join(dir, 'meta.json'))).toBe(false);
    });

    it('does not create database or directory when loading a missing session graph', () => {
        const missing = join(dir, 'missing');
        expect(loadSessionGraph(missing).order).toBe(0);
        expect(existsSync(missing)).toBe(false);
        expect(loadSessionGraph(dir).order).toBe(0);
        expect(existsSync(join(dir, 'session.sqlite'))).toBe(false);
    });

    it('imports old results on first read and leaves legacy files unchanged on later writes', () => {
        const original = JSON.stringify({ status: 'ok', data: { rounds: 1, results: [
            { id: 'r1', revision: 1, url: 'https://example.com', title: 'A', contentType: 'search', status: 'pending', origins: [{ tool: 'test', query: 'q', round: 1 }] },
        ] } });
        writeFileSync(join(dir, 'results.json'), original);
        expect(loadSessionResults(dir)).toHaveLength(1);
        appendSessionResults(dir, [{ url: 'https://example.org', title: 'B', origins: [{ tool: 'test', query: 'q' }] }]);
        expect(loadSessionResults(dir)).toHaveLength(2);
        expect(readFileSync(join(dir, 'results.json'), 'utf8')).toBe(original);
    });

    it('rolls back approval when graph update fails', () => {
        initSessionDir(dir);
        appendSessionResults(dir, [{ url: 'https://example.com', title: 'A', contentType: 'extracted', content: 'body', extractor: 'test', extractedAt: 1, origins: [{ tool: 'test', query: 'q' }] }]);
        const result = loadSessionResults(dir)[0];
        withSessionWrite(dir, db => db.prepare('INSERT INTO graph_snapshot (id, data) VALUES (1, ?)').run('invalid'));
        expect(() => approveAndInjectResults(dir, [{ id: result.id, revision: result.revision }])).toThrow('Cannot read session graph');
        expect(loadSessionResults(dir)[0].status).toBe('pending');
    });

    it('updates a session graph through SQLite without writing a legacy graph file', async () => {
        initSessionDir(dir);
        mutateSessionGraph(dir, graph => graph.addNode('e:rust', { type: 'entity', label: 'Rust', entityType: 'language' }));
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            expect(await runGraphObfuscateCommand({ graphFile: dir, list: false, fallbackRules: true, format: 'json' })).toBe(0);
            expect(loadSessionGraph(dir).getNodeAttribute('e:rust', 'obfuscatedLabel')).toBe('a programming language');
            expect(existsSync(join(dir, 'graph.json'))).toBe(false);
        } finally { log.mockRestore(); }
    });

    it('rolls back evidence and claim state when verdict persistence fails', async () => {
        initSessionDir(dir);
        appendSessionResults(dir, [{ url: 'https://example.com', title: 'A', contentType: 'extracted', content: 'body', extractor: 'test', extractedAt: 1, origins: [{ tool: 'test', query: 'q' }] }]);
        const result = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: result.id, revision: result.revision }]);
        saveClaims(dir, [{ id: 'c1', text: 'claim', riskLevel: 'low', status: 'pending', sessionDir: dir, createdAt: 1 }]);
        const file = join(dir, 'agent-inputs', 'evidence.json');
        writeFileSync(file, JSON.stringify({ resultId: result.id, quote: 'body', charStart: 0, charEnd: 4 }));
        withSessionWrite(dir, db => db.exec("CREATE TRIGGER fail_verdict BEFORE INSERT ON verdicts BEGIN SELECT RAISE(ABORT, 'injected verdict failure'); END"));
        await expect(runEvidenceVerify(dir, { claimId: 'c1', evidenceFile: file, stance: 'support', reason: 'test' })).rejects.toThrow('injected verdict failure');
        expect(loadEvidences(dir)).toEqual([]);
        expect(loadVerdicts(dir)).toEqual([]);
        expect(loadReviews(dir)).toEqual([]);
        expect(loadClaims(dir)[0].status).toBe('pending');
    });

    it('retains the original evidence and review when a changed body has one exact new location', async () => {
        initSessionDir(dir);
        const url = 'https://example.com';
        appendSessionResults(dir, [{ url, title: 'A', contentType: 'extracted', content: 'old quote tail', extractor: 'test', extractedAt: 1, origins: [{ tool: 'test', query: 'q' }] }]);
        const result = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: result.id, revision: result.revision }]);
        saveClaims(dir, [{ id: 'c1', text: 'claim', riskLevel: 'low', status: 'pending', sessionDir: dir, createdAt: 1 }]);
        const file = join(dir, 'agent-inputs', 'evidence.json');
        writeFileSync(file, JSON.stringify({ resultId: result.id, quote: 'quote', charStart: 4, charEnd: 9 }));
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        expect(await runEvidenceVerify(dir, { claimId: 'c1', evidenceFile: file, stance: 'support', reason: 'test', complete: true })).toBe(0);
        const original = loadEvidences(dir)[0];
        expect(original.snapshotId).toBeTruthy();
        recordExtractionOutcome(dir, [{ url, content: 'new prefix quote tail', extractor: 'test', extractedAt: 2 }]);
        const changed = loadEvidences(dir)[0];
        expect(loadSessionResults(dir)[0].status).toBe('pending');
        expect(changed).toMatchObject({ invalid: true, relocationStatus: 'matched', charStart: 11, charEnd: 16 });
        expect(changed.anchorHistory).toContainEqual(expect.objectContaining({ snapshotId: original.snapshotId, charStart: 4, charEnd: 9 }));
        expect(loadReviews(dir)).toEqual([]);
        expect(withSessionWrite(dir, db => db.prepare('SELECT count(*) AS count FROM review_history').get()?.count)).toBe(1);
        expect(await runReviewList(dir, { format: 'json' })).toBe(0);
        expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data.history[0]).toMatchObject({ claimId: 'c1', current: false });
        const pending = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: pending.id, revision: pending.revision }]);
        expect(loadEvidences(dir)[0].invalid).toBe(false);
        expect(loadReviews(dir)).toEqual([]);
        expect(loadClaims(dir)[0].status).toBe('verifying');
    });

    it('retains a graph fact as unconfirmed when its only source changes', () => {
        initSessionDir(dir);
        const url = 'https://example.com';
        appendSessionResults(dir, [{ url, title: 'A', contentType: 'extracted', content: 'old body', extractor: 'test', extractedAt: 1, origins: [] }]);
        const result = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: result.id, revision: result.revision }]);
        mutateSessionGraph(dir, graph => graph.addNode('e:test', { type: 'entity', label: 'Fact', sourceResultIds: [result.id] }));
        recordExtractionOutcome(dir, [{ url, content: 'new body', extractor: 'test', extractedAt: 2 }]);
        const stored = withSessionWrite(dir, db => JSON.parse(String(db.prepare('SELECT data FROM graph_snapshot WHERE id = 1').get()?.data)));
        expect(stored.data.graph.nodes.find((node: { key: string }) => node.key === 'e:test')).toBeTruthy();
        expect(listPendingGraph(dir).nodes).toContainEqual(expect.objectContaining({ id: 'e:test', pendingSourceResultIds: [result.id] }));
        expect(loadSessionGraph(dir).hasNode('e:test')).toBe(false);
        const pending = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: pending.id, revision: pending.revision }]);
        expect(loadSessionGraph(dir).hasNode('e:test')).toBe(false);
    });

    it.each(['no matching quote', '😀 and 😀'])('keeps the old anchor for zero or repeated Unicode matches: %s', content => {
        initSessionDir(dir);
        const url = 'https://example.com';
        const oldBody = 'a😀b';
        appendSessionResults(dir, [{ url, title: 'A', contentType: 'extracted', content: oldBody, extractor: 'test', extractedAt: 1, origins: [] }]);
        const result = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: result.id, revision: result.revision }]);
        saveClaims(dir, [{ id: 'c1', text: 'claim', riskLevel: 'low', status: 'verifying', sessionDir: dir, createdAt: 1 }]);
        const snapshotId = bodyVersionId(result.id, oldBody);
        saveEvidences(dir, [{ id: 'e1', claimId: 'c1', resultId: result.id, quote: '😀', charStart: 1, charEnd: 3, contentHash: createHash('sha256').update('😀').digest('hex'), extractedAt: 1, snapshotId, snapshotBinding: 'anchored' }]);
        recordExtractionOutcome(dir, [{ url, content, extractor: 'test', extractedAt: 2 }]);
        expect(loadEvidences(dir)[0]).toMatchObject({ snapshotId, charStart: 1, charEnd: 3, invalid: true, relocationStatus: 'needs_check' });
        const pending = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: pending.id, revision: pending.revision }]);
        expect(loadEvidences(dir)[0]).toMatchObject({ invalid: true, relocationStatus: 'needs_check' });
    });

    it('updates a relocated anchor again if the body changes twice before reapproval', async () => {
        initSessionDir(dir);
        const url = 'https://example.com';
        appendSessionResults(dir, [{ url, title: 'A', contentType: 'extracted', content: 'old quote', extractor: 'test', extractedAt: 1, origins: [] }]);
        const result = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: result.id, revision: result.revision }]);
        saveClaims(dir, [{ id: 'c1', text: 'claim', riskLevel: 'low', status: 'pending', sessionDir: dir, createdAt: 1 }]);
        const file = join(dir, 'agent-inputs', 'evidence.json');
        writeFileSync(file, JSON.stringify({ resultId: result.id, quote: 'quote', charStart: 4, charEnd: 9 }));
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        expect(await runEvidenceVerify(dir, { claimId: 'c1', evidenceFile: file, stance: 'support', reason: 'test' })).toBe(0);
        recordExtractionOutcome(dir, [{ url, content: 'new quote', extractor: 'test', extractedAt: 2 }]);
        recordExtractionOutcome(dir, [{ url, content: 'latest unique quote', extractor: 'test', extractedAt: 3 }]);
        expect(loadEvidences(dir)[0]).toMatchObject({ invalid: true, relocationStatus: 'matched', charStart: 14, charEnd: 19, anchorHistory: expect.arrayContaining([expect.objectContaining({ charStart: 4 }), expect.objectContaining({ charStart: 4 })]) });
        expect(loadEvidences(dir)[0].anchorHistory).toHaveLength(2);
        recordExtractionOutcome(dir, [{ url, content: 'old quote', extractor: 'test', extractedAt: 4 }]);
        expect(loadEvidences(dir)[0]).toMatchObject({ invalid: true, relocationStatus: 'matched', charStart: 4, charEnd: 9 });
        expect(loadEvidences(dir)[0].anchorHistory).toHaveLength(3);
        const pending = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: pending.id, revision: pending.revision }]);
        expect(loadEvidences(dir)[0].invalid).toBe(false);
    });

    it('retains independent graph support and requires explicit reconfirmation of the changed source', async () => {
        initSessionDir(dir);
        const urls = ['https://example.com/a', 'https://example.com/b'];
        appendSessionResults(dir, urls.map(url => ({ url, title: url, contentType: 'extracted' as const, content: 'old body', extractor: 'test', extractedAt: 1, origins: [] })));
        const results = loadSessionResults(dir);
        approveAndInjectResults(dir, results.map(result => ({ id: result.id, revision: result.revision })));
        mutateSessionGraph(dir, graph => graph.addNode('e:test', { type: 'entity', label: 'Fact', sourceResultIds: results.map(result => result.id) }));
        recordExtractionOutcome(dir, [{ url: urls[0], content: 'new body', extractor: 'test', extractedAt: 2 }]);
        expect(loadSessionGraph(dir).getNodeAttribute('e:test', 'sourceResultIds')).toEqual([results[1].id]);
        const pending = loadSessionResults(dir)[0];
        approveAndInjectResults(dir, [{ id: pending.id, revision: pending.revision }]);
        expect(loadSessionGraph(dir).getNodeAttribute('e:test', 'sourceResultIds')).toEqual([results[1].id]);
        const file = join(dir, 'agent-inputs', 'reconfirm.json');
        writeFileSync(file, JSON.stringify({ entities: [{ id: 'e:test', label: 'Fact', sourceResultIds: [results[0].id] }], edges: [] }));
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        expect(await runGraphAdd({ session: dir, dataFile: file })).toBe(0);
        expect(loadSessionGraph(dir).getNodeAttribute('e:test', 'sourceResultIds')).toEqual(results.map(result => result.id));
        expect(listPendingGraph(dir).nodes).toEqual([]);
    });
});
