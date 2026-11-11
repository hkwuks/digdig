import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawn, spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { openSessionDatabase, withTransaction } from '../../src/deep/session-db.js';

describe('session SQLite storage', () => {
    let file: string;
    let dir: string;
    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'dg-db-test-'));
        file = join(dir, 'session.sqlite');
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('rolls back result, graph and evidence changes together on failure', () => {
        const db = openSessionDatabase(file);
        try {
            expect(() => withTransaction(db, () => {
                db.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run('r1', '{}');
                db.prepare('INSERT INTO graph_snapshot (id, data) VALUES (1, ?)').run('{}');
                db.prepare('INSERT INTO claims (id, data) VALUES (?, ?)').run('c1', '{}');
                db.prepare('INSERT INTO evidences (id, claim_id, result_id, data) VALUES (?, ?, ?, ?)').run('e1', 'c1', 'r1', '{}');
                throw new Error('injected failure');
            })).toThrow('injected failure');
            for (const table of ['results', 'graph_snapshot', 'claims', 'evidences']) {
                expect(db.prepare(`SELECT count(*) AS count FROM ${table}`).get()?.count).toBe(0);
            }
        } finally { db.close(); }
    });

    it('rejects dangling evidence and persists committed rows across reopen', () => {
        const db = openSessionDatabase(file);
        expect(() => db.prepare('INSERT INTO evidences (id, claim_id, result_id, data) VALUES (?, ?, ?, ?)').run('e1', 'missing', 'missing', '{}')).toThrow();
        withTransaction(db, () => db.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run('r1', '{}'));
        db.close();
        const reopened = openSessionDatabase(file);
        try { expect(reopened.prepare('SELECT id FROM results').get()?.id).toBe('r1'); }
        finally { reopened.close(); }
    });

    it('upgrades a v1 database without changing existing body data', () => {
        const legacy = new DatabaseSync(file);
        legacy.exec("CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY REFERENCES results(id), data TEXT NOT NULL); INSERT INTO results VALUES ('r1', '{}'); PRAGMA user_version = 1");
        legacy.exec('CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, result_id TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE reviews (claim_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
        const oldBody = JSON.stringify({ content: 'old body', extractor: 'old', extractedAt: 1 });
        legacy.prepare('INSERT INTO body_snapshots VALUES (?, ?)').run('r1', oldBody);
        legacy.close();
        const db = openSessionDatabase(file);
        try {
            expect(db.prepare('PRAGMA user_version').get()?.user_version).toBe(4);
            expect(db.prepare('SELECT data FROM body_snapshots').get()?.data).toBe(oldBody);
            expect(db.prepare('SELECT content FROM body_versions').get()?.content).toBe('old body');
        } finally { db.close(); }
    });

    it('rolls back a v1 schema upgrade if an existing body is corrupt', () => {
        const legacy = new DatabaseSync(file);
        legacy.exec("CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY REFERENCES results(id), data TEXT NOT NULL); INSERT INTO results VALUES ('r1', '{}'); INSERT INTO body_snapshots VALUES ('r1', '{broken'); PRAGMA user_version = 1");
        legacy.close();
        expect(() => openSessionDatabase(file)).toThrow();
        const reopened = new DatabaseSync(file);
        try {
            expect(reopened.prepare('PRAGMA user_version').get()?.user_version).toBe(1);
            expect(reopened.prepare("SELECT name FROM sqlite_master WHERE name = 'body_versions'").get()).toBeUndefined();
            expect(reopened.prepare('SELECT data FROM body_snapshots').get()?.data).toBe('{broken');
        } finally { reopened.close(); }
    });

    it('only links legacy evidence when its offsets, quote and hash match the current body', () => {
        const legacy = new DatabaseSync(file);
        legacy.exec("CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, result_id TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE reviews (claim_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL); INSERT INTO results VALUES ('r1', '{}'); INSERT INTO claims VALUES ('c1', '{\"status\":\"reviewed\"}'); INSERT INTO reviews VALUES ('c1', '{\"decision\":\"approved\"}'); PRAGMA user_version = 1");
        legacy.exec('CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
        legacy.prepare('UPDATE results SET data = ? WHERE id = ?').run(JSON.stringify({ status: 'approved', contentType: 'extracted' }), 'r1');
        legacy.prepare('INSERT INTO body_snapshots VALUES (?, ?)').run('r1', JSON.stringify({ content: 'abc example xyz', extractor: 'test', extractedAt: 1 }));
        const hash = createHash('sha256').update('example').digest('hex');
        for (const [id, quote] of [['e1', 'example'], ['e2', 'incorrect']]) {
            legacy.prepare('INSERT INTO evidences VALUES (?, ?, ?, ?)').run(id, 'c1', 'r1', JSON.stringify({ id, claimId: 'c1', resultId: 'r1', quote, charStart: 4, charEnd: 11, contentHash: hash }));
        }
        legacy.close();
        const db = openSessionDatabase(file);
        try {
            const evidence = db.prepare('SELECT data FROM evidences ORDER BY id').all().map(row => JSON.parse(String(row.data)));
            expect(evidence[0]).toMatchObject({ snapshotBinding: 'current_match', snapshotId: expect.any(String) });
            expect(evidence[1]).toMatchObject({ snapshotBinding: 'needs_check', invalid: true, quote: 'incorrect' });
            expect(evidence[1].snapshotId).toBeUndefined();
            expect(db.prepare('SELECT count(*) AS count FROM reviews').get()?.count).toBe(0);
            expect(db.prepare('SELECT count(*) AS count FROM review_history').get()?.count).toBe(1);
            expect(JSON.parse(String(db.prepare('SELECT data FROM claims').get()?.data)).status).toBe('verifying');
        } finally { db.close(); }
    });

    it('does not leave a legacy review current when matching evidence belongs to an unapproved result', () => {
        const legacy = new DatabaseSync(file);
        legacy.exec("CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, result_id TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE reviews (claim_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version = 1");
        legacy.prepare('INSERT INTO results VALUES (?, ?)').run('r1', JSON.stringify({ status: 'pending', contentType: 'extracted' }));
        legacy.prepare('INSERT INTO body_snapshots VALUES (?, ?)').run('r1', JSON.stringify({ content: 'quote', extractor: 'test', extractedAt: 1 }));
        legacy.prepare('INSERT INTO claims VALUES (?, ?)').run('c1', JSON.stringify({ id: 'c1', status: 'reviewed' }));
        legacy.prepare('INSERT INTO reviews VALUES (?, ?)').run('c1', JSON.stringify({ claimId: 'c1', decision: 'approved' }));
        legacy.prepare('INSERT INTO evidences VALUES (?, ?, ?, ?)').run('e1', 'c1', 'r1', JSON.stringify({ id: 'e1', claimId: 'c1', resultId: 'r1', quote: 'quote', charStart: 0, charEnd: 5, contentHash: createHash('sha256').update('quote').digest('hex') }));
        legacy.close();
        const db = openSessionDatabase(file);
        try {
            expect(JSON.parse(String(db.prepare('SELECT data FROM evidences').get()?.data))).toMatchObject({ snapshotBinding: 'current_match', invalid: true, relocationStatus: 'matched' });
            expect(db.prepare('SELECT count(*) AS count FROM reviews').get()?.count).toBe(0);
            expect(db.prepare('SELECT count(*) AS count FROM review_history').get()?.count).toBe(1);
        } finally { db.close(); }
    });

    it('rolls back an actual v1 upgrade if the migration process is killed', async () => {
        const legacy = new DatabaseSync(file);
        legacy.exec("CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, result_id TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE reviews (claim_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL); INSERT INTO results VALUES ('r1', '{}'); PRAGMA user_version = 1");
        legacy.exec('CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
        legacy.prepare('INSERT INTO body_snapshots VALUES (?, ?)').run('r1', JSON.stringify({ content: 'body' }));
        legacy.close();
        const script = `
            import { DatabaseSync } from 'node:sqlite';
            import { writeSync } from 'node:fs';
            const prepare = DatabaseSync.prototype.prepare;
            DatabaseSync.prototype.prepare = function(sql) {
                const statement = prepare.call(this, sql);
                if (!sql.startsWith('INSERT INTO body_versions')) return statement;
                return { run(...args) { const result = statement.run(...args); writeSync(1, 'INSERTED\\n'); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000); return result; } };
            };
            const { openSessionDatabase } = await import('./src/deep/session-db.ts');
            openSessionDatabase(process.argv[1]);
        `;
        const worker = spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', script, file], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
        const exit = new Promise<void>(resolve => worker.once('exit', () => resolve()));
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => { worker.kill(); reject(new Error('upgrade did not reach insertion')); }, 15000);
            worker.stdout.on('data', chunk => { if (String(chunk).includes('INSERTED')) { clearTimeout(timeout); resolve(); } });
            worker.once('error', reject);
            worker.once('exit', code => { if (code !== null) { clearTimeout(timeout); reject(new Error(`upgrade exited early: ${code}`)); } });
        });
        worker.kill();
        await exit;
        const beforeRetry = new DatabaseSync(file);
        expect(beforeRetry.prepare('PRAGMA user_version').get()?.user_version).toBe(1);
        expect(beforeRetry.prepare("SELECT name FROM sqlite_master WHERE name = 'body_versions'").get()).toBeUndefined();
        beforeRetry.close();
        const upgraded = openSessionDatabase(file);
        try { expect(upgraded.prepare('SELECT content FROM body_versions').get()?.content).toBe('body'); }
        finally { upgraded.close(); }
    }, 30000);

    it('serializes two processes upgrading the same v1 database', async () => {
        const legacy = new DatabaseSync(file);
        legacy.exec("CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, result_id TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE reviews (claim_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL); INSERT INTO results VALUES ('r1', '{}'); PRAGMA user_version = 1");
        legacy.exec('CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL)');
        legacy.prepare('INSERT INTO body_snapshots VALUES (?, ?)').run('r1', JSON.stringify({ content: 'body' }));
        legacy.close();
        const script = "const { openSessionDatabase } = await import('./src/deep/session-db.ts'); const db = openSessionDatabase(process.argv[1]); db.close();";
        const start = () => new Promise<number | null>((resolve, reject) => {
            const worker = spawn(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', script, file], { cwd: process.cwd(), stdio: 'ignore' });
            worker.once('error', reject);
            worker.once('exit', resolve);
        });
        expect(await Promise.all([start(), start()])).toEqual([0, 0]);
        const upgraded = openSessionDatabase(file);
        try { expect(upgraded.prepare('SELECT count(*) AS count FROM body_versions').get()?.count).toBe(1); }
        finally { upgraded.close(); }
    }, 30000);

    it('marks legacy graph sources as current matches or pending without inventing historical versions', () => {
        const legacy = new DatabaseSync(file);
        legacy.exec("CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL, result_id TEXT NOT NULL, data TEXT NOT NULL); CREATE TABLE reviews (claim_id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY, data TEXT NOT NULL); PRAGMA user_version = 1");
        const insert = legacy.prepare('INSERT INTO results VALUES (?, ?)');
        insert.run('r1', JSON.stringify({ status: 'approved', contentType: 'extracted' }));
        insert.run('r2', JSON.stringify({ status: 'pending' }));
        const body = legacy.prepare('INSERT INTO body_snapshots VALUES (?, ?)');
        body.run('r1', JSON.stringify({ content: 'approved body', extractor: 'test', extractedAt: 1 }));
        body.run('r2', JSON.stringify({ content: 'unapproved body' }));
        legacy.prepare('INSERT INTO graph_snapshot VALUES (1, ?)').run(JSON.stringify({ data: { graph: { nodes: [{ key: 'e1', attributes: { sourceResultIds: ['r1', 'r2'] } }], edges: [] } } }));
        legacy.close();
        const db = openSessionDatabase(file);
        try {
            const attrs = JSON.parse(String(db.prepare('SELECT data FROM graph_snapshot').get()?.data)).data.graph.nodes[0].attributes;
            expect(attrs.sourceSnapshotBinding).toEqual({ r1: 'current_match', r2: 'needs_check' });
            expect(attrs.sourceSnapshotIds.r1).toBeTruthy();
            expect(attrs.sourceSnapshotIds.r2).toBeUndefined();
            expect(attrs.pendingSourceResultIds).toEqual(['r2']);
        } finally { db.close(); }
    });

    it('preserves committed state when a process exits during a transaction', () => {
        const db = openSessionDatabase(file);
        db.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run('r1', 'before');
        db.close();
        const script = `
            const { DatabaseSync } = require('node:sqlite');
            const db = new DatabaseSync(process.argv[1]);
            db.exec('BEGIN IMMEDIATE');
            db.prepare('UPDATE results SET data = ? WHERE id = ?').run('after', 'r1');
            process.exit(17);
        `;
        expect(spawnSync(process.execPath, ['-e', script, file]).status).toBe(17);
        const reopened = openSessionDatabase(file);
        try { expect(reopened.prepare('SELECT data FROM results WHERE id = ?').get('r1')?.data).toBe('before'); }
        finally { reopened.close(); }
    });

    it('refuses to initialize an unrelated database and leaves its data intact', () => {
        const other = new DatabaseSync(file);
        other.exec("CREATE TABLE existing (value TEXT); INSERT INTO existing VALUES ('keep')");
        other.close();
        expect(() => openSessionDatabase(file)).toThrow('Unrecognized session database schema');
        const reopened = new DatabaseSync(file);
        try { expect(reopened.prepare('SELECT value FROM existing').get()?.value).toBe('keep'); }
        finally { reopened.close(); }
    });

    it('rejects a competing writer while a transaction holds the database lock', () => {
        const db = openSessionDatabase(file);
        db.exec('BEGIN IMMEDIATE');
        try {
            const script = `
                const { DatabaseSync } = require('node:sqlite');
                const db = new DatabaseSync(process.argv[1], { timeout: 100 });
                try { db.exec('BEGIN IMMEDIATE'); process.exit(0); }
                catch { process.exit(19); }
            `;
            expect(spawnSync(process.execPath, ['-e', script, file]).status).toBe(19);
        } finally {
            db.exec('ROLLBACK');
            db.close();
        }
    });
});
