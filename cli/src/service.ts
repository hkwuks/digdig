/**
 * SearXNG CLI - Search Service
 */

import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { config } from './config.js';
import { dedupe } from './deep/dedupe.js';
import { SearchError, searchErrorFromStatus } from './errors.js';

export interface SearchOptions {
    query: string;
    engines?: string[];
    categories?: string[];
    limit?: number;
    page?: number;
    language?: string;
    timeRange?: 'day' | 'week' | 'month' | 'year' | 'all';
    format?: 'json' | 'csv' | 'html' | 'md';
}

export interface SearchResult {
    title: string;
    url: string;
    /** The longest body text this provider can give; what the analysis layer reads. */
    content: string;
    /**
     * The provider's own short, display-oriented blurb, when it has one. Optional
     * because only DeepSeek returns a dedicated field for it; for the others the
     * display layer falls back to `content`, whose scale already differs by two
     * orders of magnitude between providers (SearXNG 101-180 chars, Ollama tens
     * of thousands).
     */
    snippet?: string;
    engine: string;
    /**
     * Which engines returned this result, and where each of them ranked it.
     *
     * SearXNG already computes this — every result carries parallel `engines`
     * and `positions` arrays — and the mapping below used to drop both, keeping
     * only the single `engine`. That left the fusion score as a bare number with
     * nothing to explain it: two engines agreeing on result #1 and one engine
     * alone both rendered as an opaque float.
     *
     * Absent rather than partly filled when the two arrays disagree in length:
     * a half-populated pairing would pair an engine with someone else's rank.
     */
    votes?: Array<{ engine: string; position: number }>;
    category: string;
    publishedDate?: string;
    retrievedAt?: number;
    rank?: number;
    thumbnail?: string;
    score?: number;
    fusionScore?: number;
}

/**
 * An engine SearXNG asked and did not get an answer from, with its reason.
 *
 * The reason used to be discarded at the mapping step, which left the display
 * layer able to say only that *something* did not respond. "google" alone reads
 * as a transient hiccup; "google: Suspended: access denied" reads as a reason
 * to stop asking.
 */
export interface UnresponsiveEngine {
    engine: string;
    reason: string;
}

export interface SearchResponse {
    query: string;
    numberOfResults: number;
    results: SearchResult[];
    suggestions: string[];
    answers: string[];
    corrections: string[];
    infoboxes: Array<{
        infobox: string;
        content: string;
        engine: string;
    }>;
    unresponsiveEngines: UnresponsiveEngine[];
}

function filterEmptyResults(results: SearchResult[]): SearchResult[] {
    return results.filter(r => r.title.trim().length > 0 && r.content.trim().length > 0);
}

/**
 * Pair SearXNG's parallel `engines` and `positions` arrays into votes.
 *
 * The two arrays describe the same result from different engines: index i of
 * `positions` is where `engines[i]` ranked it. Unequal lengths mean the payload
 * cannot be read that way, and guessing past that would attach an engine to a
 * rank it did not give — worse than saying nothing, because the output would
 * look authoritative.
 */
function mapVotes(item: any): SearchResult['votes'] {
    const engines = item?.engines;
    const positions = item?.positions;
    if (!Array.isArray(engines) || !Array.isArray(positions)) return undefined;
    if (engines.length !== positions.length) return undefined;
    if (engines.length === 0) return undefined;

    const votes: Array<{ engine: string; position: number }> = [];
    for (let i = 0; i < engines.length; i++) {
        const engine = engines[i];
        const position = positions[i];
        // A non-string engine or a non-numeric rank is the same failure as a
        // length mismatch: the pairing is not trustworthy, so nothing is claimed.
        if (typeof engine !== 'string' || typeof position !== 'number') return undefined;
        votes.push({ engine, position });
    }
    return votes;
}

/**
 * SearXNG reports unresponsive engines as `[name, reason]` pairs.
 *
 * A bare string was accepted too, because dismissing the reason and keeping the
 * name was the old behaviour and old payloads should not silently lose the
 * entry — the entry is the fact that matters, the reason is the explanation.
 */
function mapUnresponsive(raw: any): UnresponsiveEngine[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((item: any) => {
        if (Array.isArray(item)) {
            return { engine: String(item[0] ?? ''), reason: String(item[1] ?? '') };
        }
        return { engine: String(item), reason: '' };
    }).filter(entry => entry.engine.length > 0);
}

export class SearXNGService {
    private client: AxiosInstance;

    constructor() {
        const axiosConfig: any = {
            baseURL: config.baseUrl,
            timeout: config.timeout,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'searxng-cli/1.0.0'
            }
        };

        if (config.useProxy && config.proxyUrl) {
            try {
                const proxyAgent = new HttpsProxyAgent(config.proxyUrl);
                axiosConfig.httpsAgent = proxyAgent;
                axiosConfig.httpAgent = proxyAgent;
            } catch (error) {
                console.error(`Failed to configure proxy: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        this.client = axios.create(axiosConfig);
    }

    /**
     * The server's enabled engine names.
     *
     * This used to catch its own failure, log to stderr, and return `[]` — which
     * a caller cannot tell apart from "the server listed no engines". That
     * ambiguity is why `--engines-list` reported success with exit 0 against an
     * unreachable server whenever a local provider happened to be configured.
     * A failure now propagates; the caller decides what to report.
     */
    async getEngines(): Promise<string[]> {
        const response = await this.client.get('/config');
        const engines = response.data.engines || [];
        return engines
            .filter((e: any) => e.enabled)
            .map((e: any) => e.name);
    }

    /** The server's categories. Same contract as `getEngines`: failure throws. */
    async getCategories(): Promise<string[]> {
        const response = await this.client.get('/config');
        const categories = response.data.categories || [];
        return categories.map((c: any) => typeof c === 'string' ? c : c?.name).filter(Boolean);
    }

    async search(options: SearchOptions): Promise<SearchResponse> {
        const params: Record<string, string> = {
            q: options.query,
            format: 'json'
        };

        if (options.engines && options.engines.length > 0) {
            params.engines = options.engines.join(',');
        }

        if (options.categories && options.categories.length > 0) {
            params.categories = options.categories.join(',');
        }

        if (options.language) {
            params.language = options.language;
        }

        if (options.timeRange) {
            params.time_range = options.timeRange;
        }

        if (options.page && options.page > 1) {
            params.pageno = String(options.page);
        }

        try {
            const response = await this.client.get('/search', { params });
            const data = response.data;

            const retrievedAt = Date.now();
            const results: SearchResult[] = (data.results || []).map((item: any) => ({
                title: item.title || '',
                url: item.url || '',
                content: item.content || item.snippet || '',
                engine: item.engine || 'unknown',
                votes: mapVotes(item),
                category: item.category || 'general',
                publishedDate: item.publishedDate,
                retrievedAt,
                thumbnail: item.thumbnail,
                score: item.score
            }));

            // Filter out results with empty title or content
            const filtered = filterEmptyResults(results);

            // Deduplicate: Jaccard removes near-duplicate content,
            // URL dedup catches what SearXNG missed (e.g. trailing slash variants)
            const deduped = dedupe(filtered).map((result, index) => ({ ...result, rank: index + 1 }));

            const limitedResults = options.limit && options.limit > 0
                ? deduped.slice(0, options.limit)
                : deduped;

            const searchResponse: SearchResponse = {
                query: data.query || options.query,
                numberOfResults: data.numberOfResults || limitedResults.length,
                results: limitedResults,
                suggestions: data.suggestions || [],
                answers: data.answers || [],
                corrections: data.corrections || [],
                infoboxes: data.infoboxes || [],
                unresponsiveEngines: mapUnresponsive(data.unresponsive_engines)
            };

            return searchResponse;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = `Search failed: ${error.response?.statusText || error.message}`;
                // The status used to be spent on the message and dropped. It is
                // the only fact that tells an auth failure from a rate limit, so
                // it travels on the error instead of inside the sentence.
                const status = error.response?.status;
                throw status === undefined
                    ? new SearchError('NETWORK_ERROR', message, 'searxng')
                    : searchErrorFromStatus('searxng', status, message);
            }
            throw error;
        }
    }

    async healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        baseUrl: string;
        engines?: string[];
        error?: string;
    }> {
        try {
            const response = await this.client.get('/healthz', { timeout: 5000 });
            const engines = await this.getEngines();
            return {
                status: 'healthy',
                baseUrl: config.baseUrl,
                engines
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                baseUrl: config.baseUrl,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}
