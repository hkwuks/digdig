import type { DatabaseSync } from 'node:sqlite';
import type { SessionResult, SessionResultsFile } from './session.js';
import { SessionStateError } from './session-lock.js';

export function readResults(db: DatabaseSync): SessionResultsFile {
    const rows = db.prepare('SELECT id, data, origins_present FROM results ORDER BY rowid').all();
    const origins = db.prepare('SELECT data FROM origins WHERE result_id = ? ORDER BY ordinal');
    const body = db.prepare('SELECT data FROM body_snapshots WHERE result_id = ?');
    const results = rows.map(row => {
        const result = JSON.parse(String(row.data));
        if (!result || typeof result !== 'object' || Array.isArray(result) || result.id !== row.id) throw new Error('Invalid stored result');
        const snapshot = body.get(String(row.id));
        if (snapshot) {
            const storedBody = JSON.parse(String(snapshot.data));
            if (!storedBody || typeof storedBody !== 'object' || Array.isArray(storedBody)) throw new Error('Invalid stored body');
            Object.assign(result, storedBody);
        }
        if (row.origins_present === 1) {
            result.origins = origins.all(String(row.id)).map(origin => JSON.parse(String(origin.data)));
        }
        return result as SessionResult;
    });
    const rounds = db.prepare("SELECT data FROM session_meta WHERE key = 'rounds'").get();
    const roundCount = rounds ? JSON.parse(String(rounds.data)) : 0;
    if (!Number.isSafeInteger(roundCount)) throw new Error('Invalid stored round count');
    return { status: 'ok', data: { results, rounds: roundCount } };
}

export function writeResults(db: DatabaseSync, results: SessionResult[], rounds: number): void {
    const ids = new Set(results.map(result => result.id));
    if (ids.size !== results.length) throw new SessionStateError('SESSION_CORRUPTED', 'Duplicate result identifier');
    for (const row of db.prepare('SELECT id FROM results').all()) {
        const oldId = String(row.id);
        if (ids.has(oldId)) continue;
        db.prepare('DELETE FROM origins WHERE result_id = ?').run(oldId);
        db.prepare('DELETE FROM body_snapshots WHERE result_id = ?').run(oldId);
        db.prepare('DELETE FROM results WHERE id = ?').run(oldId);
    }
    const putResult = db.prepare('INSERT INTO results (id, data, origins_present) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, origins_present=excluded.origins_present');
    const putOrigin = db.prepare('INSERT INTO origins (result_id, ordinal, data) VALUES (?, ?, ?)');
    const putBody = db.prepare('INSERT INTO body_snapshots (result_id, data) VALUES (?, ?) ON CONFLICT(result_id) DO UPDATE SET data=excluded.data');
    for (const result of results) {
        const { origins, content, extractor, extractedAt, ...discovery } = result;
        putResult.run(result.id, JSON.stringify(discovery), origins === undefined ? 0 : 1);
        db.prepare('DELETE FROM origins WHERE result_id = ?').run(result.id);
        origins?.forEach((origin, index) => putOrigin.run(result.id, index, JSON.stringify(origin)));
        if (content !== undefined || extractor !== undefined || extractedAt !== undefined) putBody.run(result.id, JSON.stringify({ content, extractor, extractedAt }));
        else db.prepare('DELETE FROM body_snapshots WHERE result_id = ?').run(result.id);
    }
    db.prepare("INSERT INTO session_meta (key, data) VALUES ('rounds', ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify(rounds));
}
