import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { withSessionRead, withSessionWrite } from '../../src/deep/session-store.js';
import { openSessionStore } from '../../src/deep/session-migrate.js';

describe('session transaction context', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dg-store-')); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('joins nested operations to one transaction and rolls them all back', () => {
        expect(() => withSessionWrite(dir, db => {
            db.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run('r1', '{}');
            withSessionWrite(dir, nested => {
                nested.prepare('INSERT INTO claims (id, data) VALUES (?, ?)').run('c1', '{}');
            });
            throw new Error('fail');
        })).toThrow('fail');
        expect(withSessionRead(dir, db => db.prepare('SELECT count(*) AS n FROM results').get()?.n)).toBe(0);
        expect(withSessionRead(dir, db => db.prepare('SELECT count(*) AS n FROM claims').get()?.n)).toBe(0);
    });

    it('reports SQLite writer contention as SESSION_BUSY', () => {
        const db = openSessionStore(dir, true)!;
        db.exec('BEGIN IMMEDIATE');
        try {
            expect(() => withSessionWrite(dir, other => other.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run('r1', '{}')))
                .toThrowError(expect.objectContaining({ code: 'SESSION_BUSY' }));
        } finally {
            db.exec('ROLLBACK');
            db.close();
        }
    }, 10000);
});
