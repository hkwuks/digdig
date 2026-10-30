/**
 * Turn one search invocation's raw provider responses into the single ordered
 * result set the caller prints and stores.
 *
 * Both search paths used to do this inline and disagreed: one fused against the
 * whole session (including the batch it had just written) and displayed every
 * historical result, the other fused only this run and keyed on a different
 * identity function. This module is the one place that decides order, so
 * `queries.length === 1` is just the case where one response came back.
 */

import { resultUrlKey } from './dedupe.js';
import { rrf, RrfInputItem } from './rrf.js';
import type { SearchResponse, SearchResult } from '../service.js';
import type { ResultOrigin } from './session.js';

export interface FusionInput {
    /** Every response this invocation produced, each carrying its own query. */
    responses: SearchResponse[];
    /** Results imported from a `--merge` file; they rank like any other list. */
    mergeResults?: SearchResult[];
    /**
     * Session contents read *before* this invocation writes anything.
     *
     * Only identities are read: history contributes a vote to the fusion and is
     * never displayed, so the stored body, status and round on a `SessionResult`
     * are irrelevant here and the type stays minimal.
     */
    sessionSnapshot?: Array<{ url: string; source?: string }>;
    /** When true, only results this invocation produced are displayed. */
    onlyCurrent: boolean;
    limit: number;
    /** Maps a result's engine to the tool that should be recorded as its origin. */
    toolFor?: (engine: string) => string;
}

export interface FusionOutput {
    /** What to print, already truncated to `limit`. */
    display: SearchResult[];
    /** The full fused ranking, untruncated — this is what `totalResults` means. */
    fused: Array<{ id: string; score: number }>;
    /** Key → every origin this invocation recorded for that result. */
    originsByKey: Map<string, ResultOrigin[]>;
    /** Keys that this invocation produced (as opposed to history). */
    currentKeys: Set<string>;
}

/** Attribute a result to the tool that produced it, for session origin records. */
export function originTool(engine: string, externalProviders: readonly string[]): string {
    return externalProviders.includes(engine) ? engine : 'digdig';
}

function toRanking(results: ReadonlyArray<{ url: string; source?: string }>): RrfInputItem[] {
    // Within one ranking an id must be unique, or RRF counts it twice: it scores
    // by array position, and the same id at two positions earns two terms.
    const seen = new Set<string>();
    const ranking: RrfInputItem[] = [];
    for (const result of results) {
        const id = resultUrlKey(result);
        if (seen.has(id)) continue;
        seen.add(id);
        ranking.push({ id });
    }
    return ranking;
}

/**
 * Fuse responses into one ranking.
 *
 * The order of the steps is the contract:
 * 1. dedupe inside every ranking, so no id votes twice in the same list;
 * 2. rank the extra lists (merge file, then the session snapshot);
 * 3. fuse;
 * 4. project — current results win over history for content, and truncation
 *    happens once, at the end.
 */
export function fuseResults(input: FusionInput): FusionOutput {
    const rankings = input.responses.map(response => toRanking(response.results));
    if (input.mergeResults?.length) rankings.push(toRanking(input.mergeResults));
    if (input.sessionSnapshot?.length) rankings.push(toRanking(input.sessionSnapshot));

    const fused = rankings.length > 0 ? rrf(rankings) : [];

    const originsByKey = new Map<string, ResultOrigin[]>();
    const currentKeys = new Set<string>();
    const current = new Map<string, SearchResult>();

    for (const response of input.responses) {
        for (const result of response.results) {
            const key = resultUrlKey(result);
            currentKeys.add(key);
            // First provider to return a URL supplies its body and its source score;
            // the others still contribute an origin, and RRF weighs the repeat.
            if (!current.has(key)) current.set(key, result);
            const origins = originsByKey.get(key) ?? [];
            origins.push({
                tool: (input.toolFor ?? (() => 'digdig'))(result.engine),
                engine: result.engine,
                query: response.query,
            });
            originsByKey.set(key, origins);
        }
    }
    // Only a current result can be displayed, so only a current result needs a body.
    for (const result of input.mergeResults ?? []) {
        const key = resultUrlKey(result);
        if (!current.has(key)) current.set(key, result);
    }

    const projected: SearchResult[] = [];
    for (const item of fused) {
        if (input.onlyCurrent && !currentKeys.has(item.id)) continue;
        const original = current.get(item.id);
        if (!original) continue;
        projected.push({ ...original, fusionScore: item.score });
    }

    const display = input.limit > 0 ? projected.slice(0, input.limit) : projected;

    return { display, fused, originsByKey, currentKeys };
}

/** Merge envelope metadata, which no ranking participates in. */
export function mergeEnvelopeMetadata(
    responses: SearchResponse[],
    base: SearchResponse | null
): Pick<SearchResponse, 'answers' | 'suggestions' | 'unresponsiveEngines'> {
    const answers: string[] = [];
    const suggestions: string[] = [];
    const unresponsiveEngines: string[] = [];
    const add = (target: string[], values: string[]) => {
        for (const value of values) if (!target.includes(value)) target.push(value);
    };
    for (const response of responses) {
        add(answers, response.answers ?? []);
        add(suggestions, response.suggestions ?? []);
        add(unresponsiveEngines, (response.unresponsiveEngines ?? []).map(item => Array.isArray(item) ? item[0] : item));
    }
    if (base) {
        add(answers, base.answers ?? []);
        add(suggestions, base.suggestions ?? []);
        add(unresponsiveEngines, (base.unresponsiveEngines ?? []).map(item => Array.isArray(item) ? item[0] : item));
    }
    return { answers, suggestions, unresponsiveEngines };
}
