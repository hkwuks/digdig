import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { DatabaseSync } from 'node:sqlite';
import { deserializeGraph } from './graph.js';
import { bindLegacyEvidence, bindLegacyGraph, bodyVersionId, ensureBodyVersion, openSessionDatabase, withTransaction } from './session-db.js';
import { classifySqliteError, SessionStateError, withSessionLock } from './session-lock.js';

type RecordValue = Record<string, unknown>;

function object(value: unknown): value is RecordValue {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file: string): unknown {
    if (!existsSync(file)) return undefined;
    try { return JSON.parse(readFileSync(file, 'utf8')); }
    catch { throw new Error(`Cannot read legacy session file: ${file}`); }
}

function records(value: unknown, file: string): RecordValue[] {
    if (value === undefined) return [];
    if (!object(value) || value.status !== 'ok' || !object(value.data) || !Array.isArray(value.data.items) || !value.data.items.every(object)) {
        throw new Error(`Invalid legacy session file: ${file}`);
    }
    return value.data.items;
}

function id(value: unknown, field: string): string {
    if (typeof value !== 'string' || !value) throw new Error(`Invalid legacy session ${field}`);
    return value;
}

/** Open an existing session, migrating it under the legacy lock if necessary. */
export function openSessionStore(sessionDir: string, create: boolean): DatabaseSync | undefined {
    const databaseFile = join(sessionDir, 'session.sqlite');
    const hasLegacyState = ['meta.json', 'results.json', 'graph.json', 'claims'].some(name => existsSync(join(sessionDir, name)));
    if (!create && !existsSync(databaseFile) && !hasLegacyState) return undefined;
    if (create) mkdirSync(sessionDir, { recursive: true });
    return withSessionLock(sessionDir, () => {
        let db: DatabaseSync;
        try {
            db = openSessionDatabase(databaseFile);
        } catch (error) {
            const classified = classifySqliteError(error);
            if (classified instanceof SessionStateError) throw classified;
            throw new SessionStateError('SESSION_STORAGE_ERROR', `Cannot open session database: ${error instanceof Error ? error.message : String(error)}`);
        }
        try {
            if (!db.prepare("SELECT 1 FROM session_meta WHERE key = 'migration_complete'").get()) {
                migrateLegacySession(sessionDir, db);
            }
            return db;
        } catch (error) {
            db.close();
            const classified = classifySqliteError(error);
            if (classified instanceof SessionStateError && classified.code === 'SESSION_BUSY') throw classified;
            throw new SessionStateError('SESSION_MIGRATION_FAILED', `Cannot migrate session: ${error instanceof Error ? error.message : String(error)}`);
        }
    });
}

/**
 * Import a complete legacy session. Caller must hold the session migration lock.
 * A successful marker and all imported records commit in one transaction.
 */
export function migrateLegacySession(sessionDir: string, db: DatabaseSync): boolean {
    return withTransaction(db, () => {
        if (db.prepare("SELECT 1 FROM session_meta WHERE key = 'migration_complete'").get()) return false;
        for (const table of ['session_meta', 'results', 'origins', 'body_snapshots', 'body_versions', 'claims', 'evidences', 'verdicts', 'verdict_evidence', 'reviews', 'graph_snapshot']) {
            if (db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get()) throw new Error('Incomplete session database contains uncommitted migration state');
        }

        const meta = readJson(join(sessionDir, 'meta.json'));
        const resultFile = readJson(join(sessionDir, 'results.json'));
        const graph = readJson(join(sessionDir, 'graph.json'));
        const claimFile = readJson(join(sessionDir, 'claims', 'claims.json'));
        const evidenceFile = readJson(join(sessionDir, 'claims', 'evidences.json'));
        const verdictFile = readJson(join(sessionDir, 'claims', 'verdicts.json'));
        const reviewFile = readJson(join(sessionDir, 'claims', 'reviews.json'));
        const claims = records(claimFile, 'claims.json');
        const evidences = records(evidenceFile, 'evidences.json');
        const verdicts = records(verdictFile, 'verdicts.json');
        const reviews = records(reviewFile, 'reviews.json');
        if (meta !== undefined && !object(meta)) throw new Error('Invalid legacy session meta.json');
        if (resultFile !== undefined && (!object(resultFile) || resultFile.status !== 'ok' || !object(resultFile.data)
            || !Number.isSafeInteger(resultFile.data.rounds) || !Array.isArray(resultFile.data.results) || !resultFile.data.results.every(object))) {
            throw new Error('Invalid legacy session results.json');
        }
        if (graph !== undefined) {
            if (!object(graph) || graph.status !== 'ok' || !object(graph.data) || !object(graph.data.graph)) throw new Error('Invalid legacy session graph.json');
            try { deserializeGraph(graph.data.graph); } catch { throw new Error('Invalid legacy session graph.json'); }
        }

        const putMeta = db.prepare('INSERT INTO session_meta (key, data) VALUES (?, ?)');
        if (meta !== undefined) putMeta.run('meta', JSON.stringify(meta));
        const resultData = object(resultFile) && object(resultFile.data) ? resultFile.data : undefined;
        putMeta.run('rounds', JSON.stringify(resultData?.rounds ?? 0));
        for (const [name, envelope, dataKeys] of [
            ['results', resultFile, ['results', 'rounds']],
            ['claims', claimFile, ['items']],
            ['evidences', evidenceFile, ['items']],
            ['verdicts', verdictFile, ['items']],
            ['reviews', reviewFile, ['items']],
        ] as const) {
            if (!object(envelope) || !object(envelope.data)) continue;
            const { status: _status, data, ...outer } = envelope;
            const extras = Object.fromEntries(Object.entries(data as RecordValue).filter(([key]) => !(dataKeys as readonly string[]).includes(key)));
            if (Object.keys(outer).length || Object.keys(extras).length) putMeta.run(`legacy_${name}_envelope`, JSON.stringify({ outer, data: extras }));
        }
        const insertResult = db.prepare('INSERT INTO results (id, data, origins_present) VALUES (?, ?, ?)');
        const insertOrigin = db.prepare('INSERT INTO origins (result_id, ordinal, data) VALUES (?, ?, ?)');
        const insertBody = db.prepare('INSERT INTO body_snapshots (result_id, data) VALUES (?, ?)');
        for (const value of (resultData?.results ?? []) as RecordValue[]) {
            const resultId = id(value.id, 'result id');
            const { origins, content, extractor, extractedAt, ...discovery } = value;
            if (origins !== undefined && (!Array.isArray(origins) || !origins.every(object))) throw new Error('Invalid legacy session origins');
            if (typeof content === 'string' && discovery.status === 'approved') {
                discovery.approvedSnapshotId = bodyVersionId(resultId, content);
            }
            insertResult.run(resultId, JSON.stringify(discovery), origins === undefined ? 0 : 1);
            if (typeof content === 'string') ensureBodyVersion(db, resultId, content);
            origins?.forEach((origin, index) => insertOrigin.run(resultId, index, JSON.stringify(origin)));
            if (content !== undefined || extractor !== undefined || extractedAt !== undefined) {
                insertBody.run(resultId, JSON.stringify({ content, extractor, extractedAt }));
            }
        }
        const insertClaim = db.prepare('INSERT INTO claims (id, data) VALUES (?, ?)');
        for (const claim of claims) {
            if (!['low', 'medium', 'high'].includes(String(claim.riskLevel))) throw new Error('Invalid legacy claim riskLevel');
            insertClaim.run(id(claim.id, 'claim id'), JSON.stringify(claim));
        }
        const insertEvidence = db.prepare('INSERT INTO evidences (id, claim_id, result_id, data) VALUES (?, ?, ?, ?)');
        for (const evidence of evidences) insertEvidence.run(id(evidence.id, 'evidence id'), id(evidence.claimId, 'claim id'), id(evidence.resultId, 'result id'), JSON.stringify(evidence));
        const insertVerdict = db.prepare('INSERT INTO verdicts (id, claim_id, data) VALUES (?, ?, ?)');
        const insertLink = db.prepare('INSERT INTO verdict_evidence (verdict_id, evidence_id) VALUES (?, ?)');
        for (const verdict of verdicts) {
            const verdictId = id(verdict.id, 'verdict id');
            if (!Array.isArray(verdict.evidenceIds)) throw new Error('Invalid legacy verdict evidenceIds');
            insertVerdict.run(verdictId, id(verdict.claimId, 'claim id'), JSON.stringify(verdict));
            for (const evidenceId of verdict.evidenceIds) insertLink.run(verdictId, id(evidenceId, 'evidence id'));
        }
        const insertReview = db.prepare('INSERT INTO reviews (claim_id, data) VALUES (?, ?)');
        for (const review of reviews) insertReview.run(id(review.claimId, 'claim id'), JSON.stringify(review));
        bindLegacyEvidence(db);
        if (graph !== undefined) db.prepare('INSERT INTO graph_snapshot (id, data) VALUES (1, ?)').run(JSON.stringify(graph));
        bindLegacyGraph(db);
        putMeta.run('migration_complete', 'true');
        return true;
    });
}
