import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'crypto';

const SCHEMA_VERSION = 3;

export function invalidateLegacyAutomaticReviews(db: DatabaseSync): void {
    const archive = db.prepare('INSERT INTO review_history (claim_id, data, invalidated_at) VALUES (?, ?, ?)');
    for (const row of db.prepare('SELECT claim_id, data FROM reviews').all()) {
        const review = JSON.parse(String(row.data));
        if (!review || typeof review !== 'object' || Array.isArray(review)) throw new Error('Invalid stored review');
        if (review.autoPass !== true || review.decision !== 'approved') continue;
        const claimId = String(row.claim_id);
        archive.run(claimId, JSON.stringify({ ...review, invalidationReason: 'source_independence_recheck' }), Date.now());
        db.prepare('DELETE FROM reviews WHERE claim_id = ?').run(claimId);
        const claimRow = db.prepare('SELECT data FROM claims WHERE id = ?').get(claimId);
        if (claimRow) {
            const claim = JSON.parse(String(claimRow.data));
            const hasValid = db.prepare('SELECT data FROM evidences WHERE claim_id = ?').all(claimId).some(item => !JSON.parse(String(item.data)).invalid);
            claim.status = hasValid ? 'verifying' : 'pending';
            db.prepare('UPDATE claims SET data = ? WHERE id = ?').run(JSON.stringify(claim), claimId);
        }
    }
}

function createSourceRelations(db: DatabaseSync): void {
    db.exec(`CREATE TABLE source_relations (
        id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id),
        left_result_id TEXT NOT NULL REFERENCES results(id), right_result_id TEXT NOT NULL REFERENCES results(id),
        left_snapshot_id TEXT NOT NULL REFERENCES body_versions(id), right_snapshot_id TEXT NOT NULL REFERENCES body_versions(id),
        relation TEXT NOT NULL CHECK (relation IN ('same', 'independent')), reason TEXT NOT NULL,
        created_at INTEGER NOT NULL, invalidated_at INTEGER, invalidation_reason TEXT,
        CHECK (left_result_id <> right_result_id));
        CREATE UNIQUE INDEX source_relations_active ON source_relations (claim_id, left_result_id, right_result_id, left_snapshot_id, right_snapshot_id) WHERE invalidated_at IS NULL;`);
}

export function bodyVersionId(resultId: string, content: string): string {
    const hash = createHash('sha256').update(content).digest('hex');
    return createHash('sha256').update(JSON.stringify([resultId, hash])).digest('hex');
}

export function ensureBodyVersion(db: DatabaseSync, resultId: string, content: string): string {
    const hash = createHash('sha256').update(content).digest('hex');
    const existing = db.prepare('SELECT id, content FROM body_versions WHERE result_id = ? AND content_hash = ?').get(resultId, hash);
    if (existing) {
        if (existing.content !== content) throw new Error('Body snapshot hash collision');
        return String(existing.id);
    }
    const id = bodyVersionId(resultId, content);
    db.prepare('INSERT INTO body_versions (id, result_id, content_hash, content) VALUES (?, ?, ?, ?)').run(id, resultId, hash, content);
    return id;
}

/** Link only a verifiable current anchor; the historical full body remains unknown. */
export function bindLegacyEvidence(db: DatabaseSync): void {
    const body = db.prepare('SELECT data FROM body_snapshots WHERE result_id = ?');
    const results = db.prepare('SELECT data FROM results WHERE id = ?');
    const update = db.prepare('UPDATE evidences SET data = ? WHERE id = ?');
    const affected = new Set<string>();
    for (const row of db.prepare('SELECT id, result_id, data FROM evidences').all()) {
        const evidence = JSON.parse(String(row.data));
        if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Invalid stored evidence');
        const raw = body.get(String(row.result_id));
        const content = raw ? JSON.parse(String(raw.data)).content : undefined;
        const start = evidence.charStart;
        const end = evidence.charEnd;
        const validRange = Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && end > start && typeof content === 'string' && end <= content.length;
        const quote = validRange ? content.slice(start, end) : '';
        const matches = validRange && evidence.resultId === row.result_id && evidence.quote === quote
            && evidence.contentHash === createHash('sha256').update(quote).digest('hex');
        if (matches) {
            evidence.snapshotId = ensureBodyVersion(db, String(row.result_id), content);
            evidence.snapshotBinding = 'current_match';
            const resultRow = results.get(String(row.result_id));
            const result = resultRow ? JSON.parse(String(resultRow.data)) : undefined;
            const bodyData = raw ? JSON.parse(String(raw.data)) : undefined;
            const approved = result?.status === 'approved' && !result.skippedAt && result.contentType === 'extracted'
                && typeof bodyData?.extractor === 'string' && bodyData.extractor.length > 0
                && typeof bodyData.extractedAt === 'number' && Number.isFinite(bodyData.extractedAt) && bodyData.extractedAt > 0;
            if (!approved && !evidence.invalid) {
                evidence.invalid = true;
                evidence.invalidationReason = 'contentChanged';
                evidence.invalidatedAt = Date.now();
                evidence.relocationStatus = 'matched';
                if (typeof evidence.claimId === 'string') affected.add(evidence.claimId);
            }
        } else {
            if (!evidence.invalid && typeof evidence.claimId === 'string') affected.add(evidence.claimId);
            evidence.snapshotBinding = 'needs_check';
            evidence.invalid = true;
        }
        update.run(JSON.stringify(evidence), row.id as string);
    }
    const archive = db.prepare('INSERT INTO review_history (claim_id, data, invalidated_at) SELECT claim_id, data, ? FROM reviews WHERE claim_id = ?');
    for (const claimId of affected) {
        archive.run(Date.now(), claimId);
        db.prepare('DELETE FROM reviews WHERE claim_id = ?').run(claimId);
        const claimRow = db.prepare('SELECT data FROM claims WHERE id = ?').get(claimId);
        if (!claimRow) continue;
        const claim = JSON.parse(String(claimRow.data));
        const hasValid = db.prepare('SELECT data FROM evidences WHERE claim_id = ?').all(claimId)
            .some(row => !JSON.parse(String(row.data)).invalid);
        claim.status = hasValid ? 'verifying' : 'pending';
        db.prepare('UPDATE claims SET data = ? WHERE id = ?').run(JSON.stringify(claim), claimId);
    }
}

/** Preserve legacy graph facts while distinguishing current matches from unknown history. */
export function bindLegacyGraph(db: DatabaseSync): void {
    const row = db.prepare('SELECT data FROM graph_snapshot WHERE id = 1').get();
    if (!row) return;
    const envelope = JSON.parse(String(row.data));
    const graph = envelope?.data?.graph;
    if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new Error('Invalid stored graph');
    const result = db.prepare('SELECT r.data AS result, b.data AS body FROM results r LEFT JOIN body_snapshots b ON b.result_id = r.id WHERE r.id = ?');
    for (const item of [...graph.nodes, ...graph.edges]) {
        const attrs = item.attributes;
        if (!attrs || !Array.isArray(attrs.sourceResultIds)) continue;
        const ids: Record<string, string> = { ...attrs.sourceSnapshotIds };
        const binding: Record<string, string> = { ...attrs.sourceSnapshotBinding };
        const pending = new Set<string>(attrs.pendingSourceResultIds ?? []);
        for (const source of attrs.sourceResultIds) {
            if (typeof source !== 'string') throw new Error('Invalid graph source');
            const stored = result.get(source);
            const metadata = stored ? JSON.parse(String(stored.result)) : undefined;
            const body = stored?.body ? JSON.parse(String(stored.body)) : undefined;
            if (metadata?.status === 'approved' && !metadata.skippedAt && metadata.contentType === 'extracted'
                && typeof body?.content === 'string' && body.content.trim() && typeof body.extractor === 'string' && body.extractor.length > 0
                && typeof body.extractedAt === 'number' && Number.isFinite(body.extractedAt) && body.extractedAt > 0) {
                ids[source] = ensureBodyVersion(db, source, body.content);
                binding[source] = 'current_match';
            } else {
                binding[source] = 'needs_check';
                pending.add(source);
            }
        }
        attrs.sourceSnapshotIds = ids;
        attrs.sourceSnapshotBinding = binding;
        if (pending.size) attrs.pendingSourceResultIds = [...pending];
    }
    db.prepare('UPDATE graph_snapshot SET data = ? WHERE id = 1').run(JSON.stringify(envelope));
}

/**
 * Open one session database. Callers own the connection and transaction lifetime.
 */
export function openSessionDatabase(file: string): DatabaseSync {
    const db = new DatabaseSync(file, { timeout: 5000, enableForeignKeyConstraints: true });
    try {
        const version = db.prepare('PRAGMA user_version').get()?.user_version;
        if (version !== 0 && version !== 1 && version !== 2 && version !== SCHEMA_VERSION) {
            throw new Error(`Unsupported session database version: ${String(version)}`);
        }
        if (version !== SCHEMA_VERSION) {
            withTransaction(db, () => {
                const lockedVersion = db.prepare('PRAGMA user_version').get()?.user_version;
                if (lockedVersion === SCHEMA_VERSION) return;
                if (lockedVersion !== 0 && lockedVersion !== 1 && lockedVersion !== 2) throw new Error(`Unsupported session database version: ${String(lockedVersion)}`);
                if (lockedVersion === 1) {
                    db.exec('CREATE TABLE body_versions (id TEXT PRIMARY KEY, result_id TEXT NOT NULL REFERENCES results(id), content_hash TEXT NOT NULL, content TEXT NOT NULL, UNIQUE (result_id, content_hash))');
                    db.exec('CREATE TABLE review_history (id INTEGER PRIMARY KEY, claim_id TEXT NOT NULL, data TEXT NOT NULL, invalidated_at INTEGER NOT NULL)');
                    for (const row of db.prepare('SELECT result_id, data FROM body_snapshots').all()) {
                        const body = JSON.parse(String(row.data));
                        if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid stored body');
                        if (typeof body.content === 'string') {
                            const snapshotId = ensureBodyVersion(db, String(row.result_id), body.content);
                            const resultRow = db.prepare('SELECT data FROM results WHERE id = ?').get(row.result_id as string);
                            if (resultRow) {
                                const result = JSON.parse(String(resultRow.data));
                                if (result.status === 'approved') {
                                    result.approvedSnapshotId = snapshotId;
                                    db.prepare('UPDATE results SET data = ? WHERE id = ?').run(JSON.stringify(result), row.result_id as string);
                                }
                            }
                        }
                    }
                    bindLegacyEvidence(db);
                    bindLegacyGraph(db);
                    createSourceRelations(db);
                    invalidateLegacyAutomaticReviews(db);
                    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
                    return;
                }
                if (lockedVersion === 2) {
                    createSourceRelations(db);
                    invalidateLegacyAutomaticReviews(db);
                    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
                    return;
                }
                const existing = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get()?.count;
                if (existing !== 0) throw new Error('Unrecognized session database schema');
                db.exec(`
                    CREATE TABLE session_meta (key TEXT PRIMARY KEY, data TEXT NOT NULL);
                    CREATE TABLE results (id TEXT PRIMARY KEY, data TEXT NOT NULL, origins_present INTEGER NOT NULL DEFAULT 1 CHECK (origins_present IN (0, 1)));
                    CREATE TABLE origins (result_id TEXT NOT NULL REFERENCES results(id), ordinal INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (result_id, ordinal));
                    CREATE TABLE body_snapshots (result_id TEXT PRIMARY KEY REFERENCES results(id), data TEXT NOT NULL);
                    CREATE TABLE body_versions (id TEXT PRIMARY KEY, result_id TEXT NOT NULL REFERENCES results(id), content_hash TEXT NOT NULL, content TEXT NOT NULL, UNIQUE (result_id, content_hash));
                    CREATE TABLE claims (id TEXT PRIMARY KEY, data TEXT NOT NULL);
                    CREATE TABLE evidences (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), result_id TEXT NOT NULL REFERENCES results(id), data TEXT NOT NULL);
                    CREATE TABLE verdicts (id TEXT PRIMARY KEY, claim_id TEXT NOT NULL REFERENCES claims(id), data TEXT NOT NULL);
                    CREATE TABLE verdict_evidence (verdict_id TEXT NOT NULL REFERENCES verdicts(id), evidence_id TEXT NOT NULL REFERENCES evidences(id), PRIMARY KEY (verdict_id, evidence_id));
                    CREATE TABLE reviews (claim_id TEXT PRIMARY KEY REFERENCES claims(id), data TEXT NOT NULL);
                    CREATE TABLE review_history (id INTEGER PRIMARY KEY, claim_id TEXT NOT NULL, data TEXT NOT NULL, invalidated_at INTEGER NOT NULL);
                    CREATE TABLE graph_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
                `);
                createSourceRelations(db);
                db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
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
