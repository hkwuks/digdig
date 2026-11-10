import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
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
