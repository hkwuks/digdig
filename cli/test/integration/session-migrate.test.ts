import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { openSessionDatabase } from '../../src/deep/session-db.js';
import { migrateLegacySession, openSessionStore } from '../../src/deep/session-migrate.js';
import { createGraph, graphStats, serializeGraph } from '../../src/deep/graph.js';
import { runCli } from '../../src/runCli.js';
import { appendSessionResults } from '../../src/deep/session.js';
import { main } from '../../src/entry.js';

const loader = `
    import { registerHooks } from 'node:module';
    import { existsSync } from 'node:fs';
    import { fileURLToPath } from 'node:url';
    registerHooks({ resolve(specifier, context, next) {
        if (specifier.startsWith('.') && specifier.endsWith('.js') && context.parentURL?.startsWith('file:')) {
            const file = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
            if (existsSync(fileURLToPath(file))) return next(file.href, context);
        }
        return next(specifier, context);
    } });
`;

function child(script: string, args: string[]) {
    return spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', loader + script, ...args], {
        cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
    });
}

function childExit(process: ReturnType<typeof child>): Promise<number | null> {
    return new Promise((resolve, reject) => {
        process.once('error', reject);
        process.once('exit', resolve);
    });
}

describe('legacy session migration', () => {
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'dg-migrate-'));
        mkdirSync(join(dir, 'claims'));
        writeFileSync(join(dir, 'meta.json'), JSON.stringify({ owner: 'user', createdAt: 1, updatedAt: 2 }));
        const graph = createGraph();
        graph.addNode('e1', { type: 'entity', label: 'Example' });
        writeFileSync(join(dir, 'graph.json'), JSON.stringify({ status: 'ok', data: { graph: serializeGraph(graph), stats: graphStats(graph) } }));
        writeFileSync(join(dir, 'results.json'), JSON.stringify({ status: 'ok', data: { rounds: 1, results: [
            { id: 'r1', revision: 1, url: 'https://example.com', title: 'Example', status: 'approved', contentType: 'extracted', content: 'body', extractor: 'test', extractedAt: 1, origins: [{ tool: 'test', query: 'q', round: 1 }] },
        ] } }));
        writeFileSync(join(dir, 'claims', 'claims.json'), JSON.stringify({ status: 'ok', data: { items: [{ id: 'c1', riskLevel: 'low', status: 'reviewed', text: 'claim' }] } }));
        writeFileSync(join(dir, 'claims', 'evidences.json'), JSON.stringify({ status: 'ok', data: { items: [{ id: 'e1', claimId: 'c1', resultId: 'r1', quote: 'body' }] } }));
        writeFileSync(join(dir, 'claims', 'verdicts.json'), JSON.stringify({ status: 'ok', data: { items: [{ id: 'v1', claimId: 'c1', evidenceIds: ['e1'], stance: 'support' }] } }));
        writeFileSync(join(dir, 'claims', 'reviews.json'), JSON.stringify({ status: 'ok', data: { items: [{ claimId: 'c1', decision: 'approved' }] } }));
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('imports distinct data domains without changing legacy files and is idempotent', () => {
        const source = readFileSync(join(dir, 'results.json'));
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        try {
            expect(migrateLegacySession(dir, db)).toBe(true);
            expect(migrateLegacySession(dir, db)).toBe(false);
            expect(db.prepare('SELECT count(*) AS n FROM results').get()?.n).toBe(1);
            expect(db.prepare('SELECT count(*) AS n FROM origins').get()?.n).toBe(1);
            expect(db.prepare('SELECT count(*) AS n FROM body_snapshots').get()?.n).toBe(1);
            expect(db.prepare('SELECT count(*) AS n FROM verdict_evidence').get()?.n).toBe(1);
            expect(JSON.parse(String(db.prepare('SELECT data FROM graph_snapshot').get()?.data))).toEqual(JSON.parse(readFileSync(join(dir, 'graph.json'), 'utf8')));
            expect(readFileSync(join(dir, 'results.json'))).toEqual(source);
        } finally { db.close(); }
    });

    it('rejects corrupt input without marking or partially importing migration', () => {
        writeFileSync(join(dir, 'claims', 'reviews.json'), '{broken');
        const before = readFileSync(join(dir, 'claims', 'reviews.json'));
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        try {
            expect(() => migrateLegacySession(dir, db)).toThrow();
            expect(db.prepare('SELECT count(*) AS n FROM results').get()?.n).toBe(0);
            expect(db.prepare("SELECT data FROM session_meta WHERE key = 'migration_complete'").get()).toBeUndefined();
            expect(readFileSync(join(dir, 'claims', 'reviews.json'))).toEqual(before);
        } finally { db.close(); }
    });

    it('does not mark migration complete for an invalid historical claim', () => {
        const file = join(dir, 'claims', 'claims.json');
        writeFileSync(file, JSON.stringify({ status: 'ok', data: { items: [{ id: 'c1', riskLevel: 'bad' }] } }));
        const before = readFileSync(file);
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        try {
            expect(() => migrateLegacySession(dir, db)).toThrow('Invalid legacy claim riskLevel');
            expect(db.prepare("SELECT data FROM session_meta WHERE key = 'migration_complete'").get()).toBeUndefined();
            expect(readFileSync(file)).toEqual(before);
        } finally { db.close(); }
    });

    it('rolls back all records when an evidence references an absent result', () => {
        writeFileSync(join(dir, 'claims', 'evidences.json'), JSON.stringify({ status: 'ok', data: { items: [
            { id: 'e1', claimId: 'c1', resultId: 'missing', quote: 'body' },
        ] } }));
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        try {
            expect(() => migrateLegacySession(dir, db)).toThrow();
            expect(db.prepare('SELECT count(*) AS n FROM results').get()?.n).toBe(0);
            expect(db.prepare('SELECT count(*) AS n FROM claims').get()?.n).toBe(0);
            expect(db.prepare("SELECT data FROM session_meta WHERE key = 'migration_complete'").get()).toBeUndefined();
        } finally { db.close(); }
    });

    it('separates content and origins while retaining all fields when reconstructed', () => {
        const source = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8')).data.results[0];
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        try {
            migrateLegacySession(dir, db);
            const discovery = JSON.parse(String(db.prepare('SELECT data FROM results WHERE id = ?').get('r1')?.data));
            const body = JSON.parse(String(db.prepare('SELECT data FROM body_snapshots WHERE result_id = ?').get('r1')?.data));
            const origins = db.prepare('SELECT data FROM origins WHERE result_id = ? ORDER BY ordinal').all('r1').map(row => JSON.parse(String(row.data)));
            expect(discovery).not.toHaveProperty('content');
            expect({ ...discovery, ...body, origins }).toEqual({ ...source, approvedSnapshotId: expect.any(String) });
        } finally { db.close(); }
    });

    it('retains unrecognized envelope metadata without duplicating result bodies', () => {
        const file = join(dir, 'results.json');
        const envelope = JSON.parse(readFileSync(file, 'utf8'));
        envelope.extra = { source: 'custom' };
        envelope.data.extraCounter = 7;
        writeFileSync(file, JSON.stringify(envelope));
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        try {
            migrateLegacySession(dir, db);
            const row = db.prepare("SELECT data FROM session_meta WHERE key = 'legacy_results_envelope'").get();
            expect(JSON.parse(String(row?.data))).toEqual({ outer: { extra: { source: 'custom' } }, data: { extraCounter: 7 } });
        } finally { db.close(); }
    });

    it('does not create a missing session when opened read-only', () => {
        const missing = join(dir, 'missing');
        expect(openSessionStore(missing, false)).toBeUndefined();
        expect(existsSync(missing)).toBe(false);
    });

    it('automatically imports once on first access and never writes legacy JSON', () => {
        const before = readFileSync(join(dir, 'results.json'));
        const first = openSessionStore(dir, false)!;
        first.prepare("UPDATE results SET data = ? WHERE id = ?").run('{"id":"r1","updated":true}', 'r1');
        first.close();
        const second = openSessionStore(dir, false)!;
        try {
            expect(JSON.parse(String(second.prepare('SELECT data FROM results WHERE id = ?').get('r1')?.data))).toMatchObject({ updated: true });
            expect(readFileSync(join(dir, 'results.json'))).toEqual(before);
        } finally { second.close(); }
    });

    it('does not accept an incomplete database that already contains records', () => {
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        db.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run('stale', '{}');
        expect(() => migrateLegacySession(dir, db)).toThrow('Incomplete session database');
        expect(db.prepare('SELECT id FROM results').get()?.id).toBe('stale');
        db.close();
    });

    it('retries an incomplete automatic migration after the source is repaired', () => {
        const file = join(dir, 'claims', 'reviews.json');
        const valid = readFileSync(file);
        writeFileSync(file, '{broken');
        expect(() => openSessionStore(dir, false)).toThrow('Cannot migrate session');
        expect(readFileSync(file, 'utf8')).toBe('{broken');
        writeFileSync(file, valid);
        const db = openSessionStore(dir, false)!;
        try {
            expect(db.prepare('SELECT count(*) AS n FROM results').get()?.n).toBe(1);
            expect(db.prepare("SELECT data FROM session_meta WHERE key = 'migration_complete'").get()?.data).toBe('true');
        } finally { db.close(); }
    });

    it('refuses migration while the legacy session lock is held', () => {
        mkdirSync(join(dir, '.lock'));
        expect(() => openSessionStore(dir, false)).toThrow('Session is busy');
        expect(existsSync(join(dir, 'session.sqlite'))).toBe(false);
    });

    it('migrates a complete old session through a read-only CLI without changing any source file', async () => {
        const files = ['meta.json', 'results.json', 'graph.json', 'claims/claims.json', 'claims/evidences.json', 'claims/verdicts.json', 'claims/reviews.json'];
        const original = files.map(file => readFileSync(join(dir, file)));
        const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const oldExit = process.exitCode;
        try {
            process.exitCode = 0;
            await runCli(['--session', dir, '--quality', '--format', 'json'], {} as never);
            expect(process.exitCode).toBe(0);
            expect(JSON.parse(output.mock.lastCall![0])).toMatchObject({ status: 'ok' });
            appendSessionResults(dir, [{ url: 'https://example.org', title: 'Another', origins: [{ tool: 'test', query: 'q' }] }]);
            expect(files.map(file => readFileSync(join(dir, file)))).toEqual(original);
        } finally {
            output.mockRestore();
            process.exitCode = oldExit;
        }
    });

    it('serializes simultaneous first migration and distinct writes from separate processes', async () => {
        const source = readFileSync(join(dir, 'results.json'));
        const script = `
            const { withSessionWrite } = await import('./src/deep/session-store.ts');
            const { setTimeout } = await import('node:timers/promises');
            for (let n = 0; ; n++) {
                try {
                    const id = process.argv[2];
                    const data = JSON.stringify({ id, revision: 1, url: 'https://example.org/' + id, title: id, contentType: 'search', status: 'pending' });
                    withSessionWrite(process.argv[1], db => db.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run(id, data));
                    break;
                } catch (error) {
                    if (error.code !== 'SESSION_BUSY' || n >= 100) throw error;
                    await setTimeout(50);
                }
            }
        `;
        const first = child(script, [dir, 'r2']);
        const second = child(script, [dir, 'r3']);
        expect(await Promise.all([childExit(first), childExit(second)])).toEqual([0, 0]);
        const db = openSessionStore(dir, false)!;
        try { expect(db.prepare('SELECT id FROM results ORDER BY id').all().map(row => row.id)).toEqual(['r1', 'r2', 'r3']); }
        finally { db.close(); }
        expect(readFileSync(join(dir, 'results.json'))).toEqual(source);
    }, 30000);

    it('recovers and retries after the migration process is killed mid-transaction', async () => {
        const source = readFileSync(join(dir, 'results.json'));
        const initial = openSessionDatabase(join(dir, 'session.sqlite'));
        initial.close();
        const script = `
            const { writeSync } = await import('node:fs');
            const { openSessionDatabase } = await import('./src/deep/session-db.ts');
            const { migrateLegacySession } = await import('./src/deep/session-migrate.ts');
            const db = openSessionDatabase(process.argv[1] + '/session.sqlite');
            const prepare = db.prepare.bind(db);
            db.prepare = sql => {
                const statement = prepare(sql);
                if (!sql.startsWith('INSERT INTO results ')) return statement;
                return { run(...args) {
                    const result = statement.run(...args);
                    writeSync(1, 'INSERTED\\n');
                    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);
                    return result;
                } };
            };
            migrateLegacySession(process.argv[1], db);
        `;
        const worker = child(script, [dir]);
        const exited = childExit(worker);
        await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { worker.kill(); reject(new Error('migration did not reach insertion')); }, 15000);
            worker.stdout.on('data', chunk => {
                if (String(chunk).includes('INSERTED')) { clearTimeout(timer); resolve(); }
            });
            worker.once('error', reject);
            worker.once('exit', code => { clearTimeout(timer); if (code !== null) reject(new Error(`migration exited early: ${code}`)); });
        });
        worker.kill();
        await exited;
        const db = openSessionDatabase(join(dir, 'session.sqlite'));
        try {
            expect(db.prepare('SELECT count(*) AS n FROM results').get()?.n).toBe(0);
            expect(db.prepare("SELECT data FROM session_meta WHERE key = 'migration_complete'").get()).toBeUndefined();
            expect(migrateLegacySession(dir, db)).toBe(true);
            expect(db.prepare('SELECT count(*) AS n FROM results').get()?.n).toBe(1);
        } finally { db.close(); }
        expect(readFileSync(join(dir, 'results.json'))).toEqual(source);
    }, 30000);

    it('reports a structured error and preserves a corrupt legacy session through the CLI entry', async () => {
        writeFileSync(join(dir, 'results.json'), '{broken');
        const original = readFileSync(join(dir, 'results.json'));
        const previousArgv = process.argv;
        const previousExit = process.exitCode;
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            process.argv = [process.execPath, 'dg', '--session', dir, '--quality'];
            process.exitCode = 0;
            await main();
            expect(process.exitCode).toBe(1);
            expect(JSON.parse(log.mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'SESSION_MIGRATION_FAILED' } });
            expect(readFileSync(join(dir, 'results.json'))).toEqual(original);
        } finally {
            process.argv = previousArgv;
            process.exitCode = previousExit;
            log.mockRestore();
        }
    });
});
