/**
 * Session state is the authority for discovery, extracted bodies, and approval.
 * Session mutations share a SQLite transaction to preserve related state.
 */

import { existsSync, mkdirSync } from 'fs';
import { createHash } from 'crypto';
import { isAbsolute, join, relative, resolve } from 'path';
import { DirectedGraph, MultiDirectedGraph } from 'graphology';
import { buildStructuralEdges, deserializeGraph, graphStats, GraphEdgeAttrs, GraphNodeAttrs, resultId, serializeGraph } from './graph.js';
import { resultUrlKey } from './dedupe.js';
import { getDefaultSessionRoot, loadSessionMeta, SessionMeta } from '../commands/session.js';
import { assertClaimsStoreReadable, loadClaims, loadEvidences, loadReviews, saveClaims, saveEvidences, saveReviews } from '../claims/store.js';
import { SessionStateError } from './session-lock.js';
import { withSessionRead, withSessionWrite } from './session-store.js';
import { bodyVersionId, ensureBodyVersion } from './session-db.js';
import { readResults as readStoredResults, writeResults as writeStoredResults } from './session-store-results.js';
export { SessionStateError } from './session-lock.js';

export type ResultContentType = 'search' | 'extracted';
export type ResultStatus = 'pending' | 'approved';

export interface ResultOrigin {
    tool: string;
    engine?: string;
    query: string;
    round?: number;
}

export interface ResultFailure {
    code: 'network' | 'parse' | 'empty' | 'tool';
    message: string;
    retryAfterMs?: number;
    retryAt?: number;
}

export interface SessionResult {
    id: string;
    revision: number;
    url: string;
    title: string;
    contentType: ResultContentType;
    excerpt?: string;
    content?: string;
    extractor?: string;
    extractedAt?: number;
    approvedSnapshotId?: string;
    contentNeedsApproval?: boolean;
    origins: ResultOrigin[];
    status: ResultStatus;
    skippedAt?: number;
    failureCount?: number;
    lastFailedAt?: number;
    lastFailure?: ResultFailure;
    engine?: string;
    category?: string;
    score?: number;
    fusionScore?: number;
    retrievedAt?: number;
    rank?: number;
    publishedDate?: string;
    byline?: string;
    siteName?: string;
    [key: string]: unknown;
}

export interface SessionResultInput {
    url: string;
    title: string;
    contentType?: ResultContentType;
    excerpt?: string;
    content?: string;
    /**
     * The search layer's display blurb, accepted only so `appendSessionResults`
     * can fold it into `excerpt` at the one place the two layers meet. It is not
     * stored: `SessionResult` has no such field, and a search body that kept both
     * names would be one thing described twice.
     */
    snippet?: string;
    extractor?: string;
    extractedAt?: number;
    origins?: ResultOrigin[];
    engine?: string;
    category?: string;
    score?: number;
    fusionScore?: number;
    retrievedAt?: number;
    rank?: number;
    publishedDate?: string;
    byline?: string;
    siteName?: string;
    [key: string]: unknown;
}

export interface ApprovalSelection {
    id: string;
    revision: number;
}

export interface ApprovalError {
    code: 'RESULT_NOT_FOUND' | 'RESULT_REVISION_CONFLICT' | 'RESULT_NOT_VERIFIED' | 'RESULT_SKIPPED';
    message: string;
    id?: string;
    revision?: number;
}

export interface ApprovalResult {
    approved: number;
    total: number;
    approvedResults: SessionResult[];
    error?: ApprovalError;
}

export interface SessionResultsFile {
    status: 'ok';
    data: { results: SessionResult[]; rounds: number };
}

function withSessionLock<T>(sessionDir: string, action: () => T): T {
    return withSessionWrite(sessionDir, action);
}

/** Keep related session artifacts consistent while one command updates them. */
export function mutateSessionState<T>(sessionDir: string, action: () => T): T {
    return withSessionLock(sessionDir, () => {
        repairInvalidDependents(sessionDir, loadSessionResults(sessionDir));
        return action();
    });
}

function originKey(origin: ResultOrigin): string {
    return `${origin.tool}\0${origin.engine ?? ''}\0${origin.query}\0${origin.round ?? ''}`;
}

function mergeOrigins(target: SessionResult, additions: ResultOrigin[], round?: number): boolean {
    const normalized = additions.map(origin => ({
        ...origin,
        ...(round !== undefined && origin.round === undefined ? { round } : {}),
    }));
    const merged = new Map(target.origins.map(origin => [originKey(origin), origin]));
    for (const origin of normalized) merged.set(originKey(origin), origin);
    const next = [...merged.values()];
    const changed = JSON.stringify(next) !== JSON.stringify(target.origins);
    target.origins = next;
    return changed;
}

function isDirectOrigin(origin: ResultOrigin): boolean {
    return origin.tool === 'user' || origin.tool === 'agent';
}

/**
 * Only a new discovery opens a round. An extracted body is a completion of a
 * result that a search already found, so it belongs to the round that found it
 * — it must not advance the counter, or every extraction would look like a
 * fresh search round to the quality and strategy readers that key off the
 * latest round.
 */
function needsRound(result: SessionResultInput): boolean {
    if (inferredContentType(result) !== 'search') return false;
    return (result.origins ?? []).some(origin => !isDirectOrigin(origin) && origin.round === undefined);
}

function inferredContentType(result: SessionResultInput): ResultContentType {
    if (result.contentType) return result.contentType;
    return typeof result.content === 'string' && typeof result.extractedAt === 'number' ? 'extracted' : 'search';
}

function makeResult(input: SessionResultInput, round?: number): SessionResult {
    const contentType = inferredContentType(input);
    const now = Date.now();
    const result: SessionResult = {
        ...input,
        id: resultId(input.url),
        revision: 1,
        url: input.url,
        title: input.title,
        contentType,
        origins: [],
        status: 'pending',
    };
    if (contentType === 'search') {
        delete result.content;
        delete result.extractor;
        delete result.extractedAt;
        // The body is not deleted with them: it moves to `excerpt`, which is this
        // layer's name for it and what the display layer reads back. `content` is
        // reserved for a verified extraction, so a provider body cannot stay
        // there without claiming an extractor that does not exist.
        if (result.excerpt === undefined) {
            const body = input.content || input.snippet;
            // Assigned only when non-empty: `x = undefined` would still create the
            // key, and the point is that a bodyless result carries no excerpt at all.
            if (body) result.excerpt = body;
        }
    } else {
        result.content = input.content ?? '';
        result.contentLength = result.content.length;
        result.extractor = input.extractor || 'default';
        result.extractedAt = input.extractedAt ?? now;
    }
    // `snippet` is the search layer's name for the display slot; at this layer it
    // is `excerpt`, and carrying both would be one thing with two names.
    delete result.snippet;
    mergeOrigins(result, input.origins ?? [], round);
    return result;
}

function touch(result: SessionResult): void {
    result.revision += 1;
}

function pruneGraphProvenance(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>, resultIdValue: string): boolean {
    let changed = false;
    const nodesToDrop: string[] = [];
    graph.forEachNode((node, attrs) => {
        if (!attrs.sourceResultIds?.includes(resultIdValue)) return;
        const sourceResultIds = attrs.sourceResultIds.filter(id => id !== resultIdValue);
        if (sourceResultIds.length) {
            graph.mergeNodeAttributes(node, { sourceResultIds });
            changed = true;
        }
        else nodesToDrop.push(node);
    });
    for (const node of nodesToDrop) {
        graph.dropNode(node);
        changed = true;
    }

    const edgesToDrop: string[] = [];
    graph.forEachEdge((edge, attrs) => {
        if (!attrs.sourceResultIds?.includes(resultIdValue)) return;
        const sourceResultIds = attrs.sourceResultIds.filter(id => id !== resultIdValue);
        if (sourceResultIds.length) {
            graph.replaceEdgeAttributes(edge, { ...attrs, sourceResultIds });
            changed = true;
        }
        else edgesToDrop.push(edge);
    });
    for (const edge of edgesToDrop) {
        graph.dropEdge(edge);
        changed = true;
    }

    if (graph.hasNode(resultIdValue)) {
        graph.dropNode(resultIdValue);
        changed = true;
    }

    // Path nodes derive from semantic entities and are invalid once an input entity disappears.
    const pathsToDrop: string[] = [];
    graph.forEachNode((node, attrs) => {
        if (attrs.type === 'path' && attrs.entities?.some(entity => !graph.hasNode(entity))) pathsToDrop.push(node);
    });
    for (const node of pathsToDrop) {
        graph.dropNode(node);
        changed = true;
    }

    const structuralNodesToDrop: string[] = [];
    graph.forEachNode((node, attrs) => {
        if ((attrs.type === 'query' || attrs.type === 'domain') && graph.degree(node) === 0) structuralNodesToDrop.push(node);
    });
    for (const node of structuralNodesToDrop) {
        graph.dropNode(node);
        changed = true;
    }
    return changed;
}

function markGraphProvenancePending(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>, resultIdValue: string): boolean {
    let changed = false;
    graph.forEachNode((node, attrs) => {
        if (attrs.sourceResultIds?.includes(resultIdValue) && !attrs.pendingSourceResultIds?.includes(resultIdValue)) {
            graph.mergeNodeAttributes(node, { pendingSourceResultIds: [...(attrs.pendingSourceResultIds ?? []), resultIdValue] });
            changed = true;
        }
    });
    graph.forEachEdge((edge, attrs) => {
        if (attrs.sourceResultIds?.includes(resultIdValue) && !attrs.pendingSourceResultIds?.includes(resultIdValue)) {
            graph.mergeEdgeAttributes(edge, { pendingSourceResultIds: [...(attrs.pendingSourceResultIds ?? []), resultIdValue] });
            changed = true;
        }
    });
    return changed;
}

export function visibleSessionGraph(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>, results: SessionResult[]): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const visible = graph.copy();
    const pendingResults = new Set(results.filter(result => result.status !== 'approved' || result.skippedAt).map(result => result.id));
    const dropNodes: string[] = [];
    visible.forEachNode((node, attrs) => {
        if (attrs.type === 'result' && pendingResults.has(node)) { dropNodes.push(node); return; }
        if (!attrs.pendingSourceResultIds?.length || !attrs.sourceResultIds?.length) return;
        const active = attrs.sourceResultIds.filter(id => !attrs.pendingSourceResultIds!.includes(id));
        if (!active.length) dropNodes.push(node);
        else visible.mergeNodeAttributes(node, { sourceResultIds: active });
    });
    for (const node of dropNodes) visible.dropNode(node);
    const dropEdges: string[] = [];
    const affectedPathEdges: Array<[string, string]> = [];
    visible.forEachEdge((edge, attrs, source, target) => {
        if (!attrs.pendingSourceResultIds?.length || !attrs.sourceResultIds?.length) return;
        const active = attrs.sourceResultIds.filter(id => !attrs.pendingSourceResultIds!.includes(id));
        if (!active.length) { dropEdges.push(edge); affectedPathEdges.push([source, target]); }
        else visible.mergeEdgeAttributes(edge, { sourceResultIds: active });
    });
    for (const edge of dropEdges) visible.dropEdge(edge);
    const dropPaths: string[] = [];
    visible.forEachNode((node, attrs) => {
        if (attrs.type === 'path' && attrs.entities && (attrs.entities.some(entity => graph.hasNode(entity) && !visible.hasNode(entity))
            || affectedPathEdges.some(([source, target]) => attrs.entities!.includes(source) && attrs.entities!.includes(target)))) dropPaths.push(node);
    });
    for (const node of dropPaths) visible.dropNode(node);
    return visible;
}

function writeResults(sessionDir: string, results: SessionResult[], rounds: number): void {
    withSessionWrite(sessionDir, db => writeStoredResults(db, results, rounds));
}

function readResultsFile(sessionDir: string): SessionResultsFile | undefined {
    try {
        return withSessionRead(sessionDir, readStoredResults);
    } catch (error) {
        if (error instanceof SessionStateError) throw error;
        throw new SessionStateError('SESSION_CORRUPTED', `Cannot read session results: ${sessionDir}`);
    }
}

function touchMeta(sessionDir: string): void {
    const existing = loadSessionMeta(sessionDir);
    if (!existing) return;
    withSessionWrite(sessionDir, db => db.prepare("INSERT INTO session_meta (key, data) VALUES ('meta', ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data")
        .run(JSON.stringify({ ...existing, updatedAt: Date.now() })));
}

/** A result may enter evidence and semantic workflows only with a captured body. */
export function hasVerifiedContent(result: SessionResult): result is SessionResult & { content: string; extractedAt: number; extractor: string } {
    return result.contentType === 'extracted'
        && typeof result.content === 'string'
        && result.content.trim().length > 0
        && typeof result.extractedAt === 'number'
        && Number.isFinite(result.extractedAt)
        && result.extractedAt > 0
        && typeof result.extractor === 'string'
        && result.extractor.length > 0;
}

export function resolveSessionPath(sessionValue: string): string {
    if (sessionValue === 'new') {
        const root = getDefaultSessionRoot();
        mkdirSync(root, { recursive: true });
        return join(root, `ds_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    }
    return !sessionValue.includes('/') && !sessionValue.includes('\\')
        ? join(getDefaultSessionRoot(), sessionValue)
        : sessionValue;
}

export function initSessionDir(sessionDir: string, owner?: string, description?: string, query?: string): void {
    mkdirSync(sessionDir, { recursive: true });
    mkdirSync(join(sessionDir, 'agent-inputs'), { recursive: true });
    const existing = loadSessionMeta(sessionDir);
    const now = Date.now();
    const meta: SessionMeta = {
        owner: owner || existing?.owner || '',
        description: description || existing?.description || '',
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        query: query || existing?.query || '',
    };
    withSessionWrite(sessionDir, db => db.prepare("INSERT INTO session_meta (key, data) VALUES ('meta', ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify(meta)));
}

/** Agent write inputs must belong to exactly the session being mutated. */
export function validateSessionInputFile(sessionDir: string, inputFile: string): string | undefined {
    const inputsDir = resolve(sessionDir, 'agent-inputs');
    const candidate = resolve(inputFile);
    const rel = relative(inputsDir, candidate);
    if (rel === '' || isAbsolute(rel) || rel.startsWith('..') || rel.includes(':') || !existsSync(candidate)) return undefined;
    return candidate;
}

export function loadSessionResults(sessionDir: string): SessionResult[] {
    const data = readResultsFile(sessionDir);
    return data?.data.results ?? [];
}

export function loadSessionRounds(sessionDir: string): number {
    return readResultsFile(sessionDir)?.data.rounds ?? 0;
}

/** Record each successful query immediately; the first success allocates a batch round. */
export function recordSuccessfulQuery(sessionDir: string, query: string, allocatedRound?: number): number {
    return withSessionWrite(sessionDir, db => {
        const row = db.prepare("SELECT data FROM session_meta WHERE key = 'rounds'").get();
        const current = row ? JSON.parse(String(row.data)) : 0;
        if (!Number.isSafeInteger(current) || current < 0) throw new SessionStateError('SESSION_CORRUPTED', 'Invalid stored round count');
        const round = allocatedRound ?? current + 1;
        db.prepare('INSERT INTO search_queries (round, query, executed_at) VALUES (?, ?, ?)').run(round, query, Date.now());
        if (round > current) db.prepare("INSERT INTO session_meta (key, data) VALUES ('rounds', ?) ON CONFLICT(key) DO UPDATE SET data=excluded.data").run(JSON.stringify(round));
        return round;
    });
}

export function loadSessionQueryHistory(sessionDir: string): string[] {
    return withSessionRead(sessionDir, db => {
        const recorded = db.prepare('SELECT query FROM search_queries ORDER BY id').all().map(row => String(row.query));
        const legacy = db.prepare('SELECT data FROM origins ORDER BY result_id, ordinal').all().map(row => (JSON.parse(String(row.data)) as ResultOrigin).query);
        return [...new Set([...recorded, ...legacy].filter(query => typeof query === 'string' && query.trim()))];
    }) ?? [];
}

export function appendSessionResults(
    sessionDir: string,
    newResults: SessionResultInput[],
    allocatedRound?: number,
): { added: number; updated: number; total: number; round: number; approvedResults: SessionResult[] } {
    return withSessionLock(sessionDir, () => {
        const state = readResultsFile(sessionDir);
        const results = state?.data.results ?? [];
        const currentRounds = state?.data.rounds ?? 0;
        const incrementRound = allocatedRound === undefined && newResults.some(needsRound);
        const round = incrementRound ? currentRounds + 1 : currentRounds;
        const byKey = new Map(results.map(result => [resultUrlKey(result), result]));
        let added = 0;
        let updated = 0;
        const approvedResults: SessionResult[] = [];

        for (const input of newResults) {
            const key = resultUrlKey(input);
            const existing = byKey.get(key);
            // Every origin records a round, so no reader has to guess what an
            // absent one means. A discovery carries the round it opened; an
            // extracted body carries the round that discovered it.
            const previousRounds = existing?.origins?.map(origin => origin.round).filter((value): value is number => Number.isSafeInteger(value) && value! > 0) ?? [];
            const importRound = existing && inferredContentType(input) === 'extracted' && previousRounds.length
                ? Math.min(...previousRounds)
                : Math.max(1, allocatedRound ?? round);
            if (!existing) {
                const created = makeResult(input, importRound);
                byKey.set(key, created);
                added++;
                continue;
            }

            let changed = mergeOrigins(existing, input.origins ?? [], importRound);
            if (inferredContentType(input) === 'extracted') {
                const nextContent = input.content ?? '';
                if (existing.contentLength !== nextContent.length) {
                    existing.contentLength = nextContent.length;
                    changed = true;
                }
                const bodyChanged = existing.contentType !== 'extracted' || existing.content !== nextContent;
                const nextExtractedAt = input.extractedAt ?? Date.now();
                if (bodyChanged) {
                    existing.contentType = 'extracted';
                    existing.content = nextContent;
                    if (existing.approvedSnapshotId) existing.contentNeedsApproval = true;
                    changed = true;
                }
                if (existing.extractor !== (input.extractor || 'default')) {
                    existing.extractor = input.extractor || 'default';
                    changed = true;
                }
                if (existing.extractedAt !== nextExtractedAt) {
                    existing.extractedAt = nextExtractedAt;
                    changed = true;
                }
                // An imported body is a fresh Agent input, even when its text is unchanged.
                const wasSkipped = existing.skippedAt !== undefined;
                if (wasSkipped) {
                    existing.skippedAt = undefined;
                    changed = true;
                }
                if (existing.failureCount !== undefined || existing.lastFailedAt !== undefined || existing.lastFailure !== undefined) {
                    existing.failureCount = undefined;
                    existing.lastFailedAt = undefined;
                    existing.lastFailure = undefined;
                    changed = true;
                }
                // Only a body that actually differs, or one that revives a result
                // the Agent had skipped, is a new approval decision. Re-importing
                // bytes that are already approved must not revoke that approval:
                // the downgrade below prunes the result's semantic graph, and
                // graph-add cannot rebuild what is dropped.
                if ((bodyChanged || wasSkipped) && existing.status !== 'pending') {
                    existing.status = 'pending';
                    changed = true;
                }
            }
            if (input.title && input.title !== existing.title) {
                existing.title = input.title;
                changed = true;
            }
            if (input.excerpt !== undefined && (inferredContentType(input) !== 'extracted' || input.excerpt.trim()) && input.excerpt !== existing.excerpt) {
                existing.excerpt = input.excerpt;
                changed = true;
            } else if (input.excerpt === undefined
                && inferredContentType(input) === 'search'
                && existing.contentType === 'search') {
                // A search result carries its body in `content` and its short blurb
                // in `snippet`; both are `excerpt` at this layer. Only for a
                // search result: an extracted entry's excerpt is the page
                // description a provider body has no business replacing.
                const body = input.content || input.snippet;
                if (body && body !== existing.excerpt) {
                    existing.excerpt = body;
                    changed = true;
                }
            }
            for (const field of ['score', 'fusionScore', 'retrievedAt', 'rank', 'publishedDate'] as const) {
                if (input[field] !== undefined && input[field] !== existing[field]) {
                    (existing as Record<string, unknown>)[field] = input[field];
                    changed = true;
                }
            }
            if (changed) {
                touch(existing);
                updated++;
                if (existing.status === 'approved') approvedResults.push(existing);
            }
        }

        const all = [...byKey.values()];
        writeResults(sessionDir, all, round);
        repairInvalidDependents(sessionDir, all);
        touchMeta(sessionDir);
        return { added, updated, total: all.length, round, approvedResults };
    });
}

export function appendAndInjectSessionResults(sessionDir: string, newResults: SessionResultInput[], allocatedRound?: number): ReturnType<typeof appendSessionResults> {
    return withSessionWrite(sessionDir, () => {
        const result = appendSessionResults(sessionDir, newResults, allocatedRound);
        injectApprovedResults(sessionDir, result.approvedResults);
        return result;
    });
}

/** A search result still waiting for a body, and not yet given up on. */
export function isPendingExtraction(result: SessionResult): boolean {
    return result.contentType === 'search'
        && !result.skippedAt
        && (result.failureCount ?? 0) < 2;
}

/** An extracted record awaiting an approval decision. */
export function isPendingApproval(result: SessionResult): boolean {
    return result.status === 'pending'
        && !result.skippedAt
        && hasVerifiedContent(result);
}

export function getPendingExtractionResults(sessionDir: string): SessionResult[] {
    return loadSessionResults(sessionDir).filter(isPendingExtraction);
}

/** Extracted records awaiting an approval decision. */
export function getPendingResults(sessionDir: string): SessionResult[] {
    return loadSessionResults(sessionDir).filter(isPendingApproval);
}

export function getApprovedResults(sessionDir: string): SessionResult[] {
    return loadSessionResults(sessionDir).filter(result => result.status === 'approved' && !result.skippedAt && hasVerifiedContent(result));
}

function repairInvalidDependents(sessionDir: string, results: SessionResult[]): void {
    const changedRelations = withSessionWrite(sessionDir, db => {
        const rows = db.prepare('SELECT * FROM source_relations WHERE invalidated_at IS NULL').all();
        const changed = new Set<string>();
        for (const row of rows) {
            const stale = [['left_result_id', 'left_snapshot_id'], ['right_result_id', 'right_snapshot_id']].some(([resultKey, snapshotKey]) => {
                const result = results.find(item => item.id === row[resultKey]);
                return !result || typeof result.content !== 'string' || bodyVersionId(result.id, result.content) !== row[snapshotKey];
            });
            if (stale) {
                db.prepare("UPDATE source_relations SET invalidated_at = ?, invalidation_reason = 'snapshot_changed' WHERE id = ?").run(Date.now(), String(row.id));
                changed.add(String(row.claim_id));
            }
        }
        return changed;
    });
    const invalidReasons = new Map(
        results
            .filter(result => result.skippedAt || result.contentNeedsApproval || (result.approvedSnapshotId !== undefined
                && (typeof result.content !== 'string' || result.approvedSnapshotId !== bodyVersionId(result.id, result.content))))
            .map(result => [result.id, result.skippedAt ? 'sourceSkipped' : 'contentChanged'] as const),
    );
    {
        assertClaimsStoreReadable(sessionDir);
        const evidences = loadEvidences(sessionDir);
        const affectedClaims = new Set<string>(changedRelations);
        const newlyInvalidClaims = new Set<string>(changedRelations);
        const now = Date.now();
        let evidenceChanged = false;
        for (const evidence of evidences) {
            const reason = invalidReasons.get(evidence.resultId);
            if (reason) {
                affectedClaims.add(evidence.claimId);
            }
            if (evidence.invalid && evidence.invalidatedAt !== undefined) affectedClaims.add(evidence.claimId);
            const result = results.find(item => item.id === evidence.resultId);
            const changedAgain = reason === 'contentChanged' && evidence.invalid && evidence.relocationStatus === 'matched'
                && typeof result?.content === 'string' && evidence.snapshotId !== bodyVersionId(result.id, result.content);
            if (reason && (!evidence.invalid || changedAgain)) {
                if (reason === 'contentChanged' && evidence.snapshotId && result?.content) {
                    const oldSnapshot = withSessionRead(sessionDir, db => db.prepare('SELECT content FROM body_versions WHERE id = ? AND result_id = ?').get(evidence.snapshotId!, evidence.resultId));
                    const oldContent = typeof oldSnapshot?.content === 'string' ? oldSnapshot.content : '';
                    const oldQuote = oldContent.slice(evidence.charStart, evidence.charEnd);
                    const oldValid = evidence.charStart >= 0 && evidence.charEnd > evidence.charStart && evidence.charEnd <= oldContent.length
                        && oldQuote === evidence.quote && createHash('sha256').update(oldQuote).digest('hex') === evidence.contentHash;
                    const first = result.content.indexOf(evidence.quote);
                    const unique = oldValid && evidence.quote.length > 0 && first >= 0 && result.content.indexOf(evidence.quote, first + 1) < 0;
                    if (unique) {
                        evidence.anchorHistory = [...(evidence.anchorHistory ?? []), { snapshotId: evidence.snapshotId, charStart: evidence.charStart, charEnd: evidence.charEnd, extractedAt: evidence.extractedAt, snapshotBinding: evidence.snapshotBinding }];
                        evidence.snapshotId = withSessionWrite(sessionDir, db => ensureBodyVersion(db, result.id, result.content!));
                        evidence.snapshotBinding = 'anchored';
                        evidence.charStart = first;
                        evidence.charEnd = first + evidence.quote.length;
                        if (result.extractedAt !== undefined) evidence.extractedAt = result.extractedAt;
                        evidence.relocationStatus = 'matched';
                    } else evidence.relocationStatus = 'needs_check';
                }
                evidence.invalid = true;
                evidence.invalidatedAt = now;
                evidence.invalidationReason = reason;
                newlyInvalidClaims.add(evidence.claimId);
                evidenceChanged = true;
            }
        }
        if (affectedClaims.size) {
            const claims = loadClaims(sessionDir);
            const reviews = loadReviews(sessionDir);
            const invalidateReviews = new Set<string>();
            for (const claim of claims) {
                if (!affectedClaims.has(claim.id)) continue;
                const valid = evidences.some(evidence => evidence.claimId === claim.id && !evidence.invalid);
                const review = reviews.find(item => item.claimId === claim.id);
                const newerInvalidation = evidences.some(evidence => evidence.claimId === claim.id && evidence.invalid && evidence.invalidatedAt !== undefined && review && evidence.invalidatedAt > review.reviewedAt);
                if (!valid || newlyInvalidClaims.has(claim.id) || newerInvalidation) invalidateReviews.add(claim.id);
                if (!valid) claim.status = 'pending';
                else if (!review || invalidateReviews.has(claim.id)) claim.status = 'verifying';
            }
            saveReviews(sessionDir, reviews.filter(review => !invalidateReviews.has(review.claimId)));
            saveClaims(sessionDir, claims);
            if (evidenceChanged) saveEvidences(sessionDir, evidences);
        }
    }

    {
        const { graph, missing } = readSessionGraph(sessionDir);
        if (!missing) {
            let graphChanged = false;
            for (const [resultIdValue, reason] of invalidReasons) {
                graphChanged = (reason === 'sourceSkipped' ? pruneGraphProvenance(graph, resultIdValue) : markGraphProvenancePending(graph, resultIdValue)) || graphChanged;
            }
            if (graphChanged) writeSessionGraph(sessionDir, graph);
        }
    }
}

export function approveResults(sessionDir: string, selections: ApprovalSelection[]): ApprovalResult {
    return withSessionLock(sessionDir, () => {
        const state = readResultsFile(sessionDir);
        const results = state?.data.results ?? [];
        repairInvalidDependents(sessionDir, results);
        const selected = new Set<string>();
        for (const selection of selections) {
            const result = results.find(item => item.id === selection.id);
            if (!result) return { approved: 0, total: results.length, approvedResults: [], error: { code: 'RESULT_NOT_FOUND', message: `Result not found: ${selection.id}`, id: selection.id } };
            if (result.revision !== selection.revision) return { approved: 0, total: results.length, approvedResults: [], error: { code: 'RESULT_REVISION_CONFLICT', message: `Result revision changed: ${selection.id}`, id: selection.id, revision: result.revision } };
            if (result.skippedAt) return { approved: 0, total: results.length, approvedResults: [], error: { code: 'RESULT_SKIPPED', message: `Result is skipped: ${selection.id}`, id: selection.id } };
            if (!hasVerifiedContent(result)) return { approved: 0, total: results.length, approvedResults: [], error: { code: 'RESULT_NOT_VERIFIED', message: `Result has no extracted body: ${selection.id}`, id: selection.id } };
            selected.add(result.id);
        }

        const approvedResults: SessionResult[] = [];
        for (const result of results) {
            if (selected.has(result.id) && result.status !== 'approved') {
                result.status = 'approved';
                result.approvedSnapshotId = bodyVersionId(result.id, result.content!);
                result.contentNeedsApproval = false;
                touch(result);
                approvedResults.push(result);
            }
        }
        if (approvedResults.length) {
            const evidence = loadEvidences(sessionDir);
            const claims = loadClaims(sessionDir);
            const changedClaims = new Set<string>();
            for (const item of evidence) {
                const result = approvedResults.find(candidate => candidate.id === item.resultId);
                if (!result?.content || !item.invalid || item.invalidationReason !== 'contentChanged' || item.relocationStatus !== 'matched') continue;
                const currentId = withSessionWrite(sessionDir, db => ensureBodyVersion(db, result.id, result.content!));
                if (item.snapshotId !== currentId || result.content.slice(item.charStart, item.charEnd) !== item.quote) continue;
                item.invalid = false;
                delete item.invalidatedAt;
                delete item.invalidationReason;
                changedClaims.add(item.claimId);
            }
            if (changedClaims.size) {
                for (const claim of claims) if (changedClaims.has(claim.id)) claim.status = 'verifying';
                saveEvidences(sessionDir, evidence);
                saveClaims(sessionDir, claims);
            }
        }
        writeResults(sessionDir, results, state?.data.rounds ?? 0);
        touchMeta(sessionDir);
        return { approved: approvedResults.length, total: results.length, approvedResults };
    });
}

export function approveAndInjectResults(sessionDir: string, selections: ApprovalSelection[]): { approval: ApprovalResult; injectInfo: { nodesAdded: number; edgesAdded: number } } {
    return withSessionWrite(sessionDir, () => {
        const approval = approveResults(sessionDir, selections);
        const injectInfo = approval.error ? { nodesAdded: 0, edgesAdded: 0 } : injectApprovedResults(sessionDir, approval.approvedResults);
        return { approval, injectInfo };
    });
}

export function setSkipped(sessionDir: string, selections: ApprovalSelection[], skipped: boolean): { changed: number; results: SessionResult[]; error?: ApprovalError } {
    return withSessionLock(sessionDir, () => {
        const state = readResultsFile(sessionDir);
        const results = state?.data.results ?? [];
        const selected: SessionResult[] = [];
        const selectedIds = new Set<string>();
        for (const selection of selections) {
            const result = results.find(item => item.id === selection.id);
            if (!result) return { changed: 0, results: [], error: { code: 'RESULT_NOT_FOUND', message: `Result not found: ${selection.id}`, id: selection.id } };
            if (result.revision !== selection.revision) return { changed: 0, results: [], error: { code: 'RESULT_REVISION_CONFLICT', message: `Result revision changed: ${selection.id}`, id: selection.id, revision: result.revision } };
            if (!selectedIds.has(result.id)) {
                selectedIds.add(result.id);
                selected.push(result);
            }
        }
        let changed = 0;
        for (const result of selected) {
            const shouldChange = skipped ? result.skippedAt === undefined : result.skippedAt !== undefined;
            if (shouldChange) {
                const wasSkipped = result.skippedAt !== undefined;
                result.skippedAt = skipped ? Date.now() : undefined;
                if (wasSkipped && !skipped && result.status === 'approved') result.status = 'pending';
                touch(result);
                changed++;
            }
        }
        writeResults(sessionDir, results, state?.data.rounds ?? 0);
        repairInvalidDependents(sessionDir, results);
        touchMeta(sessionDir);
        return { changed, results: selected };
    });
}

export function recordExtractionOutcome(
    sessionDir: string,
    outcomes: Array<{ url: string; content?: string; title?: string; excerpt?: string; byline?: string; siteName?: string; length?: number; extractedAt?: number; extractor?: string; failure?: ResultFailure }>
): { updated: number; failed: number; total: number } {
    return withSessionLock(sessionDir, () => {
        const state = readResultsFile(sessionDir);
        const results = state?.data.results ?? [];
        const byKey = new Map(results.map(result => [resultUrlKey(result), result]));
        let updated = 0;
        let failed = 0;
        for (const outcome of outcomes) {
            const result = byKey.get(resultUrlKey({ url: outcome.url }));
            if (!result) continue;
            if (outcome.failure) {
                if (outcome.failure.retryAfterMs === undefined) result.failureCount = (result.failureCount ?? 0) + 1;
                result.lastFailedAt = Date.now();
                result.lastFailure = outcome.failure;
                touch(result);
                failed++;
                continue;
            }
            if (typeof outcome.content !== 'string' || !outcome.content.trim()) continue;
            const wasSkipped = result.skippedAt !== undefined;
            const changedBody = result.contentType !== 'extracted' || result.content !== outcome.content;
            if (changedBody && result.approvedSnapshotId) result.contentNeedsApproval = true;
            result.contentType = 'extracted';
            result.content = outcome.content;
            result.extractor = outcome.extractor || 'default';
            result.extractedAt = outcome.extractedAt ?? Date.now();
            result.title = outcome.title || result.title;
            if (outcome.excerpt?.trim()) result.excerpt = outcome.excerpt;
            if (outcome.byline !== undefined) result.byline = outcome.byline;
            if (outcome.siteName !== undefined) result.siteName = outcome.siteName;
            result.contentLength = outcome.content.length;
            result.skippedAt = undefined;
            result.failureCount = undefined;
            result.lastFailedAt = undefined;
            result.lastFailure = undefined;
            if ((changedBody || wasSkipped) && result.status === 'approved') result.status = 'pending';
            touch(result);
            updated++;
        }
        writeResults(sessionDir, results, state?.data.rounds ?? 0);
        repairInvalidDependents(sessionDir, results);
        touchMeta(sessionDir);
        return { updated, failed, total: results.length };
    });
}

/** Compatibility name for callers that already provide extraction output. */
export function mergeExtractedContent(sessionDir: string, extracted: Array<{ url: string; content: string; title?: string; excerpt?: string; byline?: string; siteName?: string; length?: number; extractedAt?: number; extractor?: string; error?: string }>): { updated: number; total: number } {
    const result = recordExtractionOutcome(sessionDir, extracted.map(item => item.error
        ? { url: item.url, failure: { code: 'tool' as const, message: item.error } }
        : item));
    return { updated: result.updated, total: result.total };
}

function readSessionGraph(sessionDir: string): { graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>; missing: boolean } {
    try {
        const row = withSessionRead(sessionDir, db => db.prepare('SELECT data FROM graph_snapshot WHERE id = 1').get());
        if (!row) return { graph: new MultiDirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>(), missing: true };
        const parsed = JSON.parse(String(row.data));
        const graphData = parsed.status === 'ok' && parsed.data?.graph ? parsed.data.graph : null;
        if (!graphData) throw new Error('invalid graph envelope');
        return { graph: deserializeGraph(graphData), missing: false };
    } catch (error) {
        if (error instanceof SessionStateError) throw error;
        throw new SessionStateError('SESSION_CORRUPTED', `Cannot read session graph: ${sessionDir}`);
    }
}

export function loadSessionGraph(sessionDir: string): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    if (!['session.sqlite', 'meta.json', 'results.json', 'graph.json', 'claims'].some(name => existsSync(join(sessionDir, name)))) {
        return new MultiDirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    }
    return withSessionLock(sessionDir, () => {
        repairInvalidDependents(sessionDir, loadSessionResults(sessionDir));
        return visibleSessionGraph(readSessionGraph(sessionDir).graph, loadSessionResults(sessionDir));
    });
}

export function listPendingGraph(sessionDir: string): { nodes: object[]; edges: object[] } {
    if (!['session.sqlite', 'meta.json', 'results.json', 'graph.json', 'claims'].some(name => existsSync(join(sessionDir, name)))) return { nodes: [], edges: [] };
    return withSessionLock(sessionDir, () => {
        repairInvalidDependents(sessionDir, loadSessionResults(sessionDir));
        const graph = readSessionGraph(sessionDir).graph;
        const nodes: object[] = [];
        const edges: object[] = [];
        graph.forEachNode((id, attrs) => {
            if (attrs.pendingSourceResultIds?.length) nodes.push({ id, ...attrs });
        });
        graph.forEachEdge((id, attrs, source, target) => {
            if (attrs.pendingSourceResultIds?.length) edges.push({ id, source, target, ...attrs });
        });
        return { nodes, edges };
    });
}

function writeSessionGraph(sessionDir: string, graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): void {
    const value = { status: 'ok', data: { graph: serializeGraph(graph), stats: graphStats(graph) } };
    withSessionWrite(sessionDir, db => db.prepare('INSERT INTO graph_snapshot (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(value)));
    touchMeta(sessionDir);
}

function buildApprovedStructuralEdges(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>, approved: SessionResult[]): void {
    const groups = new Map<string, { query: string; round?: number; results: Array<{ url: string; title: string; origins: ResultOrigin[] }> }>();
    for (const result of approved) {
        for (const origin of result.origins) {
            const key = `${origin.round ?? ''}\0${origin.query}`;
            const group = groups.get(key) ?? { query: origin.query, round: origin.round, results: [] };
            group.results.push({ url: result.url, title: result.title, origins: result.origins });
            groups.set(key, group);
        }
    }
    for (const group of groups.values()) buildStructuralEdges(graph, group.query, group.results, group.round);
}

/** Serialize graph read-modify-write operations under one session lock. */
export function mutateSessionGraph<T>(
    sessionDir: string,
    action: (graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>, approved: SessionResult[]) => T,
    options?: { reconcileStructural?: boolean },
): T {
    return withSessionLock(sessionDir, () => {
        repairInvalidDependents(sessionDir, loadSessionResults(sessionDir));
        const { graph, missing } = readSessionGraph(sessionDir);
        // Results are authoritative; a missing derived graph can safely regain its structural layer.
        const approved = getApprovedResults(sessionDir);
        if (missing && options?.reconcileStructural) buildApprovedStructuralEdges(graph, approved);
        const value = action(graph, approved);
        writeSessionGraph(sessionDir, graph);
        return value;
    });
}

export function injectApprovedResults(sessionDir: string, approved: SessionResult[]): { nodesAdded: number; edgesAdded: number } {
    const verified = approved.filter(hasVerifiedContent);
    if (!verified.length) return { nodesAdded: 0, edgesAdded: 0 };
    return mutateSessionGraph(sessionDir, graph => {
        const beforeNodes = graph.order;
        const beforeEdges = graph.size;
        // Rebuild all approved structure when the graph is absent, then add this approval.
        buildApprovedStructuralEdges(graph, getApprovedResults(sessionDir));
        return { nodesAdded: graph.order - beforeNodes, edgesAdded: graph.size - beforeEdges };
    });
}

export function countPendingResults(sessionDir: string): number {
    return getPendingResults(sessionDir).length;
}

export function updateSessionGraph(sessionDir: string, query: string, results: SessionResult[], round?: number): { nodesAdded: number; edgesAdded: number } {
    const verified = results.filter(hasVerifiedContent);
    if (!verified.length) return { nodesAdded: 0, edgesAdded: 0 };
    return mutateSessionGraph(sessionDir, graph => {
        const beforeNodes = graph.order;
        const beforeEdges = graph.size;
        buildStructuralEdges(graph, query, verified.map(result => ({ url: result.url, title: result.title, origins: result.origins })), round);
        return { nodesAdded: graph.order - beforeNodes, edgesAdded: graph.size - beforeEdges };
    });
}
