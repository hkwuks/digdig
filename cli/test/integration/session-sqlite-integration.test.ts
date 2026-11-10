import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendSessionResults, approveAndInjectResults, initSessionDir, loadSessionGraph, loadSessionResults, mutateSessionGraph } from '../../src/deep/session.js';
import { withSessionWrite } from '../../src/deep/session-store.js';
import { runGraphObfuscateCommand } from '../../src/commands/graph-obfuscate.js';
import { runEvidenceVerify } from '../../src/commands/evidence.js';
import { loadClaims, loadEvidences, loadReviews, loadVerdicts, saveClaims } from '../../src/claims/store.js';

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
});
