import { resolve } from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { openSessionStore } from './session-migrate.js';
import { withTransaction } from './session-db.js';
import { classifySqliteError } from './session-lock.js';

const active = new Map<string, DatabaseSync>();

/** Run a complete session mutation in one transaction, including nested store operations. */
export function withSessionWrite<T>(sessionDir: string, action: (db: DatabaseSync) => T): T {
    const key = resolve(sessionDir);
    const existing = active.get(key);
    if (existing) return action(existing);
    const db = openSessionStore(sessionDir, true)!;
    try {
        return withTransaction(db, () => {
            active.set(key, db);
            try { return action(db); } finally { active.delete(key); }
        });
    } catch (error) { throw classifySqliteError(error); }
    finally { db.close(); }
}

/** Read a consistent session snapshot without creating a missing session. */
export function withSessionRead<T>(sessionDir: string, action: (db: DatabaseSync) => T): T | undefined {
    const key = resolve(sessionDir);
    const existing = active.get(key);
    if (existing) return action(existing);
    const db = openSessionStore(sessionDir, false);
    if (!db) return undefined;
    try {
        db.exec('BEGIN');
        active.set(key, db);
        try {
            const result = action(db);
            db.exec('COMMIT');
            return result;
        } catch (error) {
            if (db.isTransaction) db.exec('ROLLBACK');
            throw error;
        } finally { active.delete(key); }
    } catch (error) { throw classifySqliteError(error); }
    finally { db.close(); }
}
