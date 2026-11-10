import type { DatabaseSync } from 'node:sqlite';
import { SessionStateError } from './session-lock.js';

export type ClaimTable = 'claims' | 'evidences' | 'verdicts' | 'reviews';

function recordId(value: unknown): string {
    if (typeof value !== 'string' || !value) throw new SessionStateError('SESSION_CORRUPTED', 'Invalid session record identifier');
    return value;
}

export function readRecords<T>(db: DatabaseSync, table: ClaimTable): T[] {
    return db.prepare(`SELECT data FROM ${table} ORDER BY rowid`).all().map(row => JSON.parse(String(row.data)) as T);
}

export function writeRecords(db: DatabaseSync, table: ClaimTable, records: object[]): void {
    const key = table === 'reviews' ? 'claimId' : 'id';
    const column = table === 'reviews' ? 'claim_id' : 'id';
    const retained = new Set(records.map(record => recordId((record as Record<string, unknown>)[key])));
    if (retained.size !== records.length) throw new SessionStateError('SESSION_CORRUPTED', `Duplicate ${table} identifier`);
    for (const row of db.prepare(`SELECT ${column} AS id FROM ${table}`).all()) {
        const id = String(row.id);
        if (retained.has(id)) continue;
        if (table === 'verdicts') db.prepare('DELETE FROM verdict_evidence WHERE verdict_id = ?').run(id);
        db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(id);
    }

    for (const value of records) {
        const item = value as Record<string, unknown>;
        const id = recordId(item[key]);
        const data = JSON.stringify(item);
        if (table === 'claims') {
            db.prepare('INSERT INTO claims (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(id, data);
        } else if (table === 'evidences') {
            db.prepare('INSERT INTO evidences (id, claim_id, result_id, data) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET claim_id=excluded.claim_id, result_id=excluded.result_id, data=excluded.data')
                .run(id, recordId(item.claimId), recordId(item.resultId), data);
        } else if (table === 'verdicts') {
            if (!Array.isArray(item.evidenceIds)) throw new SessionStateError('SESSION_CORRUPTED', 'Invalid verdict evidenceIds');
            db.prepare('INSERT INTO verdicts (id, claim_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET claim_id=excluded.claim_id, data=excluded.data')
                .run(id, recordId(item.claimId), data);
            db.prepare('DELETE FROM verdict_evidence WHERE verdict_id = ?').run(id);
            const link = db.prepare('INSERT INTO verdict_evidence (verdict_id, evidence_id) VALUES (?, ?)');
            for (const evidenceId of item.evidenceIds) link.run(id, recordId(evidenceId));
        } else {
            db.prepare('INSERT INTO reviews (claim_id, data) VALUES (?, ?) ON CONFLICT(claim_id) DO UPDATE SET data=excluded.data').run(id, data);
        }
    }
}
