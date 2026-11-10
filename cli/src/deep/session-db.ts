import { DatabaseSync } from 'node:sqlite';

const SCHEMA_VERSION = 1;

/**
 * Open one session database. Callers own the connection and transaction lifetime.
 */
export function openSessionDatabase(file: string): DatabaseSync {
    const db = new DatabaseSync(file, { timeout: 5000, enableForeignKeyConstraints: true });
    try {
        const version = db.prepare('PRAGMA user_version').get()?.user_version;
        if (version !== 0 && version !== SCHEMA_VERSION) {
            throw new Error(`Unsupported session database version: ${String(version)}`);
        }
        if (version === 0) {
            withTransaction(db, () => {
                const lockedVersion = db.prepare('PRAGMA user_version').get()?.user_version;
                if (lockedVersion === SCHEMA_VERSION) return;
                if (lockedVersion !== 0) throw new Error(`Unsupported session database version: ${String(lockedVersion)}`);
                const existing = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get()?.count;
                if (existing !== 0) throw new Error('Unrecognized session database schema');
                db.exec(`
                    CREATE TABLE session_meta (key TEXT PRIMARY KEY, data TEXT NOT NULL);
                    CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL, origins_present INTEGER NOT NULL DEFAULT 1 CHECK (origins_present IN (0, 1)));
                    CREATE TABLE origins (result_id TEXT NOT NULL REFERENCES results(id), ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (result_id, ordinal));
                    CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY REFERENCES results(id), data TEXT NOT NULL);
                    CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                    CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), result_id TEXT NOT NULL REFERENCES results(id), data TEXT NOT NULL);
                    CREATE TABLE verdicts (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), data TEXT NOT NULL);
                    CREATE TABLE verdict_evidence (verdict_id TEXT NOT NULL REFERENCES verdicts(id), evidence_id TEXT NOT NULL REFERENCES evidences(id), PRIMARY KEY (verdict_id, evidence_id));
                    CREATE TABLE reviews (claim_id TEXT PRIMARY KEY REFERENCES claims(id), data TEXT NOT NULL);
                    CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
                    PRAGMA user_version = ${SCHEMA_VERSION};
                `);
            });
        }
        db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
        return db;
    } catch (error) {
        db.close();
        throw error;
    }
}

export function withTransaction<T>(db: DatabaseSync, action: () => T): T {
    db.exec('BEGIN IMMEDIATE');
    try {
        const result = action();
        db.exec('COMMIT');
        return result;
    } catch (error) {
        if (db.isTransaction) db.exec('ROLLBACK');
        throw error;
    }
}
