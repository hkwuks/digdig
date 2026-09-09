/**
 * Session state is the authority for discovery, extracted bodies, and approval.
 * Every mutation uses an atomic same-directory write so an interrupted command
 * cannot turn a valid session into an empty one.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import { DirectedGraph, MultiDirectedGraph } from 'graphology';
import { buildStructuralEdges, deserializeGraph, graphStats, GraphEdgeAttrs, GraphNodeAttrs, resultId, serializeGraph } from './graph.js';
import { resultUrlKey } from './dedupe.js';
import { getDefaultSessionRoot, loadSessionMeta, SessionMeta } from '../commands/session.js';
import { assertClaimsStoreReadable, loadClaims, loadEvidences, loadReviews, saveClaims, saveEvidences, saveReviews } from '../claims/store.js';

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

export class SessionStateError extends Error {
    constructor(readonly code: 'SESSION_BUSY' | 'SESSION_CORRUPTED', message: string) {
        super(message);
    }
}

const SESSION_LOCK_STALE_MS = 30_000;

function atomicWriteJson(file: string, value: unknown): void {
    const temp = join(dirname(file), `.${file.split(/[\\/]/).pop()}.${process.pid}.${Date.now()}.tmp`);
    writeFileSync(temp, JSON.stringify(value, null, 2), 'utf-8');
    try {
        renameSync(temp, file);
    } catch (error) {
        try { rmSync(temp, { force: true }); } catch { /* preserve the original write error */ }
        throw error;
    }
}

function withSessionLock<T>(sessionDir: string, action: () => T): T {
    mkdirSync(sessionDir, { recursive: true });
    const lockDir = join(sessionDir, '.lock');
    let acquired = false;
    try {
        try {
            mkdirSync(lockDir);
            acquired = true;
        } catch (error) {
            try {
                const age = Date.now() - statSync(lockDir).mtimeMs;
                if (age > SESSION_LOCK_STALE_MS) rmSync(lockDir, { recursive: true, force: true });
                else throw error;
                mkdirSync(lockDir);
                acquired = true;
            } catch {
                throw new SessionStateError('SESSION_BUSY', `Session is busy: ${sessionDir}`);
            }
        }
        return action();
    } finally {
        if (acquired) {
            try { rmSync(lockDir, { recursive: true, force: true }); } catch { /* lock cleanup is best effort */ }
        }
    }
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

function needsRound(result: SessionResultInput): boolean {
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
    } else {
        result.content = input.content ?? '';
        result.extractor = input.extractor || 'default';
        result.extractedAt = input.extractedAt ?? now;
    }
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

function writeResults(sessionDir: string, results: SessionResult[], rounds: number): void {
    atomicWriteJson(join(sessionDir, 'results.json'), { status: 'ok', data: { results, rounds } } satisfies SessionResultsFile);
}

function readResultsFile(sessionDir: string): SessionResultsFile | undefined {
    const file = join(sessionDir, 'results.json');
    if (!existsSync(file)) return undefined;
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf-8')) as SessionResultsFile;
        if (parsed.status !== 'ok' || !Array.isArray(parsed.data?.results) || !Number.isSafeInteger(parsed.data.rounds)) {
            throw new Error('invalid results envelope');
        }
        return parsed;
    } catch (error) {
        throw new SessionStateError('SESSION_CORRUPTED', `Cannot read session results: ${file}`);
    }
}

function touchMeta(sessionDir: string): void {
    const existing = loadSessionMeta(sessionDir);
    if (!existing) return;
    atomicWriteJson(join(sessionDir, 'meta.json'), { ...existing, updatedAt: Date.now() });
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
    atomicWriteJson(join(sessionDir, 'meta.json'), meta);
}

/** Agent write inputs must belong to exactly the session being mutated. */
export function validateSessionInputFile(sessionDir: string, inputFile: string): string | undefined {
    const inputsDir = resolve(sessionDir, 'agent-inputs');
    const candidate = resolve(inputFile);
    const rel = relative(inputsDir, candidate);
    if (rel === '' || rel.startsWith('..') || rel.includes(':') || !existsSync(candidate)) return undefined;
    return candidate;
}

export function loadSessionResults(sessionDir: string): SessionResult[] {
    const data = readResultsFile(sessionDir);
    return data?.data.results ?? [];
}

export function loadSessionRounds(sessionDir: string): number {
    return readResultsFile(sessionDir)?.data.rounds ?? 0;
}

export function appendSessionResults(
    sessionDir: string,
    newResults: SessionResultInput[],
    options?: { skipRoundIncrement?: boolean }
): { added: number; updated: number; total: number; round: number; approvedResults: SessionResult[] } {
    return withSessionLock(sessionDir, () => {
        const state = readResultsFile(sessionDir);
        const results = state?.data.results ?? [];
        const currentRounds = state?.data.rounds ?? 0;
        const incrementRound = !options?.skipRoundIncrement && newResults.some(needsRound);
        const round = incrementRound ? currentRounds + 1 : currentRounds;
        const byKey = new Map(results.map(result => [resultUrlKey(result), result]));
        let added = 0;
        let updated = 0;
        const approvedResults: SessionResult[] = [];

        for (const input of newResults) {
            const key = resultUrlKey(input);
            const existing = byKey.get(key);
            const importRound = needsRound(input) ? Math.max(1, round) : undefined;
            if (!existing) {
                const created = makeResult(input, importRound);
                byKey.set(key, created);
                added++;
                continue;
            }

            let changed = mergeOrigins(existing, input.origins ?? [], importRound);
            if (inferredContentType(input) === 'extracted') {
                const nextContent = input.content ?? '';
                const bodyChanged = existing.contentType !== 'extracted' || existing.content !== nextContent;
                const nextExtractedAt = input.extractedAt ?? Date.now();
                if (bodyChanged) {
                    existing.contentType = 'extracted';
                    existing.content = nextContent;
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
                if (existing.skippedAt !== undefined) {
                    existing.skippedAt = undefined;
                    changed = true;
                }
                if (existing.failureCount !== undefined || existing.lastFailedAt !== undefined || existing.lastFailure !== undefined) {
                    existing.failureCount = undefined;
                    existing.lastFailedAt = undefined;
                    existing.lastFailure = undefined;
                    changed = true;
                }
                if (existing.status !== 'pending') {
                    existing.status = 'pending';
                    changed = true;
                }
            }
            if (input.title && input.title !== existing.title) {
                existing.title = input.title;
                changed = true;
            }
            if (input.excerpt !== undefined && input.excerpt !== existing.excerpt) {
                existing.excerpt = input.excerpt;
                changed = true;
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

export function getPendingExtractionResults(sessionDir: string): SessionResult[] {
    return loadSessionResults(sessionDir).filter(result => result.contentType === 'search'
        && !result.skippedAt
        && (result.failureCount ?? 0) < 2);
}

/** Extracted records awaiting an approval decision. */
export function getPendingResults(sessionDir: string): SessionResult[] {
    return loadSessionResults(sessionDir).filter(result => result.status === 'pending'
        && !result.skippedAt
        && hasVerifiedContent(result));
}

export function getApprovedResults(sessionDir: string): SessionResult[] {
    return loadSessionResults(sessionDir).filter(result => result.status === 'approved' && !result.skippedAt && hasVerifiedContent(result));
}

function repairInvalidDependents(sessionDir: string, results: SessionResult[]): void {
    const invalidReasons = new Map(
        results
            .filter(result => result.skippedAt || result.status !== 'approved' || !hasVerifiedContent(result))
            .map(result => [result.id, result.skippedAt ? 'sourceSkipped' : 'contentChanged'] as const),
    );
    if (!invalidReasons.size) return;
    try {
        assertClaimsStoreReadable(sessionDir);
        const evidences = loadEvidences(sessionDir);
        const affectedClaims = new Set<string>();
        const now = Date.now();
        let evidenceChanged = false;
        for (const evidence of evidences) {
            const reason = invalidReasons.get(evidence.resultId);
            if (reason) {
                affectedClaims.add(evidence.claimId);
            }
            if (reason && !evidence.invalid) {
                evidence.invalid = true;
                evidence.invalidatedAt = now;
                evidence.invalidationReason = reason;
                evidenceChanged = true;
            }
        }
        if (affectedClaims.size) {
            if (evidenceChanged) saveEvidences(sessionDir, evidences);
            const claims = loadClaims(sessionDir);
            for (const claim of claims) if (affectedClaims.has(claim.id)) claim.status = 'verifying';
            saveClaims(sessionDir, claims);
            saveReviews(sessionDir, loadReviews(sessionDir).filter(review => !affectedClaims.has(review.claimId)));
        }
    } catch { /* Preserve corrupt claim artifacts for their dedicated repair commands. */ }

    try {
        const { graph, missing } = readSessionGraph(sessionDir);
        if (!missing) {
            let graphChanged = false;
            for (const resultIdValue of invalidReasons.keys()) graphChanged = pruneGraphProvenance(graph, resultIdValue) || graphChanged;
            if (graphChanged) writeSessionGraph(sessionDir, graph);
        }
    } catch (error) {
        if (!(error instanceof SessionStateError)) throw error;
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
                touch(result);
                approvedResults.push(result);
            }
        }
        writeResults(sessionDir, results, state?.data.rounds ?? 0);
        touchMeta(sessionDir);
        return { approved: approvedResults.length, total: results.length, approvedResults };
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
                result.failureCount = (result.failureCount ?? 0) + 1;
                result.lastFailedAt = Date.now();
                result.lastFailure = outcome.failure;
                touch(result);
                failed++;
                continue;
            }
            if (typeof outcome.content !== 'string' || !outcome.content.trim()) continue;
            const wasSkipped = result.skippedAt !== undefined;
            const changedBody = result.contentType !== 'extracted' || result.content !== outcome.content;
            result.contentType = 'extracted';
            result.content = outcome.content;
            result.extractor = outcome.extractor || 'default';
            result.extractedAt = outcome.extractedAt ?? Date.now();
            result.title = outcome.title || result.title;
            if (outcome.excerpt !== undefined) result.excerpt = outcome.excerpt;
            if (outcome.byline !== undefined) result.byline = outcome.byline;
            if (outcome.siteName !== undefined) result.siteName = outcome.siteName;
            if (outcome.length !== undefined) result.contentLength = outcome.length;
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
    const file = join(sessionDir, 'graph.json');
    if (!existsSync(file)) return { graph: new MultiDirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>(), missing: true };
    try {
        const parsed = JSON.parse(readFileSync(file, 'utf-8'));
        const graphData = parsed.status === 'ok' && parsed.data?.graph ? parsed.data.graph : null;
        if (!graphData) throw new Error('invalid graph envelope');
        return { graph: deserializeGraph(graphData), missing: false };
    } catch {
        throw new SessionStateError('SESSION_CORRUPTED', `Cannot read session graph: ${file}`);
    }
}

export function loadSessionGraph(sessionDir: string): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    return withSessionLock(sessionDir, () => {
        repairInvalidDependents(sessionDir, loadSessionResults(sessionDir));
        return readSessionGraph(sessionDir).graph;
    });
}

function writeSessionGraph(sessionDir: string, graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): void {
    atomicWriteJson(join(sessionDir, 'graph.json'), { status: 'ok', data: { graph: serializeGraph(graph), stats: graphStats(graph) } });
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
        // Rebuild all approved structure when graph.json is absent, then add this approval.
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
