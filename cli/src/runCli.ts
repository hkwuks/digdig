/**
 * SearXNG CLI - CLI Runner (Commander-based)
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));
import { SearXNGService, SearchOptions, SearchResult, SearchResponse } from './service.js';
import { createSuccessEnvelope, createErrorEnvelope } from './protocol.js';
import { config } from './config.js';
import { OllamaService } from './ollama-service.js';
import { DeepSeekService } from './deepseek-service.js';
import { initConfig } from './init.js';
import { runExtract, ExtractOptions } from './commands/extract.js';
import { runQueryGraph, QueryGraphOptions } from './commands/query-graph.js';
import { runGraphAdd, GraphAddOptions } from './commands/graph-add.js';
import { runResultsAdd, ResultsAddOptions } from './commands/results-add.js';
import { runDocIndex } from './commands/doc-index.js';
import { runDocSearch } from './commands/doc-search.js';
import { runGraphObfuscateCommand, GraphObfuscateOptions } from './commands/graph-obfuscate.js';
import { ContentExtractor } from './deep/extractor.js';
import { resultUrlKey, sourceKey } from './deep/dedupe.js';
import { fuseResults, mergeEnvelopeMetadata } from './deep/fuse.js';
import { deserializeGraph, graphStats, GraphNodeAttrs, GraphEdgeAttrs } from './deep/graph.js';
import { initSessionDir, resolveSessionPath, appendSessionResults, loadSessionResults, loadSessionGraph, countPendingResults, getPendingResults, approveResults, injectApprovedResults, hasVerifiedContent, setSkipped } from './deep/session.js';
import { runSessionList, runSessionDelete, getDefaultSessionRoot } from './commands/session.js';
import { graphPreprocess } from './deep/graph-preprocess.js';
import { checkQueryRedundancy, RedundancyConfig } from './deep/query-redundancy.js';
import { buildPendingReport, describeResult, PendingReport } from './deep/pending-facts.js';
import { generateQuerySuggestions } from './deep/query-suggest.js';
import { determineSearchStage, getStrategyInfo } from './deep/search-strategy.js';
import { getSessionAnalysis } from './deep/iteration-data.js';
import { runCoverage } from './commands/coverage.js';
import { runGraphExplore } from './commands/graph-explore.js';
import { runGraphDrill } from './commands/graph-drill.js';
import { runGraphTraverse } from './commands/graph-traverse.js';
import { runGraphSearch } from './commands/graph-search.js';
import { runClaimAdd, runClaimList } from './commands/claim.js';
import { runEvidenceSearch, runEvidenceVerify, runEvidenceList } from './commands/evidence.js';
import { runVerdictList } from './commands/verdict.js';
import { runPolicyAggregate, runReviewList } from './commands/review.js';
import { readSessionJsonInput } from './commands/json-input.js';
import { DirectedGraph } from 'graphology';
import { writeFileSync, existsSync } from 'fs';

/**
 * The text a human or Agent should see for one result.
 *
 * `snippet` is what the provider offered as a display blurb, `excerpt` is the
 * same slot after the result entered a session, and `content` is the fallback:
 * a search body when no shorter text exists, and the extracted body otherwise.
 * `||` rather than `??` — an empty string and a missing field are the same thing
 * to a display layer. This is not used for the `--quality` pending list, which
 * reviews extracted bodies and must read `content` itself.
 */
function displayText(result: { snippet?: string; excerpt?: string; content?: string }): string {
    return result.snippet || result.excerpt || result.content || '';
}

function formatAsMarkdown(data: any): string {
    const lines: string[] = [];

    lines.push(`## Search: ${data.query || 'Unknown'}`);
    lines.push('');

    const results = data.results || [];
    if (results.length > 0) {
        lines.push(`**${results.length}** results`);
        lines.push('');

        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            let scoreIndicator = '';
            if (r.score !== undefined && r.score !== null) {
                scoreIndicator = ` [Source score: ${r.score}]`;
            }
            lines.push(`### ${i + 1}. [${r.title || 'No Title'}](${r.url || '#'})${scoreIndicator}`);
            lines.push('');

            if (displayText(r)) {
                lines.push(displayText(r));
                lines.push('');
            }

            const meta: string[] = [];
            if (r.rank !== undefined) meta.push(`Rank: ${r.rank}`);
            meta.push(`Engine: ${r.engine || 'unknown'}`);
            if (r.category) meta.push(`Category: ${r.category}`);
            if (r.publishedDate) meta.push(`Published: ${r.publishedDate}`);
            if (r.retrievedAt) meta.push(`Retrieved: ${new Date(r.retrievedAt).toISOString()}`);
            if (r.fusionScore !== undefined) meta.push(`Fusion score: ${r.fusionScore}`);
            lines.push(meta.join(' · '));
            lines.push('');
        }
    } else {
        lines.push('No results found.');
        lines.push('');
    }

    if (data.unresponsiveEngines && data.unresponsiveEngines.length > 0) {
        const unresponsive = data.unresponsiveEngines.map((item: any) =>
            Array.isArray(item) ? item[0] : item
        ).join(', ');
        lines.push(`*Unresponsive: ${unresponsive}*`);
        lines.push('');
    }

    if (data.suggestions && data.suggestions.length > 0) {
        lines.push('**Suggestions:** ' + data.suggestions.join(' · '));
        lines.push('');
    }

    return lines.join('\n');
}

function formatOutput(data: any, format: 'json' | 'md'): string {
    if (format === 'md') return formatAsMarkdown(data);
    return JSON.stringify(data, null, 2);
}

function formatPreprocessAsMarkdown(data: any): string {
    const lines: string[] = [];
    lines.push('## Graph Preprocess Results');
    lines.push('');
    lines.push(`**Strategy:** ${data.tokenizationStrategy}`);
    lines.push(`**Coverage:** ${data.resultsWithContent}/${data.totalResults} results with content`);
    lines.push(`**Rounds:** ${data.roundsCovered}`);
    if (data.coOccurrenceTruncated) lines.push('*Co-occurrence matrix was truncated*');
    lines.push('');

    if (data.tfidfTerms?.length) {
        lines.push('### Top TF-IDF Terms');
        lines.push('');
        lines.push('| Term | TF-IDF | Doc Freq |');
        lines.push('|------|--------|----------|');
        for (const t of data.tfidfTerms.slice(0, 20)) {
            lines.push(`| ${t.term} | ${t.tfidf.toFixed(2)} | ${t.docFreq} |`);
        }
        lines.push('');
    }

    if (data.coOccurrences?.length) {
        lines.push('### Co-occurrences');
        lines.push('');
        lines.push('| Term 1 | Term 2 | Count |');
        lines.push('|--------|--------|-------|');
        for (const p of data.coOccurrences.slice(0, 20)) {
            lines.push(`| ${p.term1} | ${p.term2} | ${p.count} |`);
        }
        lines.push('');
    }

    if (data.existingEntities?.length) {
        lines.push('### Existing Entities');
        lines.push('');
        for (const e of data.existingEntities) {
            lines.push(`- ${e.label} (degree: ${e.degree}${e.entityType ? `, type: ${e.entityType}` : ''})`);
        }
        lines.push('');
    }

    if (data.resultProvenance?.length) {
        lines.push('### Result Provenance');
        lines.push('');
        lines.push('| ID | URL | Title | Rounds |');
        lines.push('|----|-----|-------|--------|');
        for (const result of data.resultProvenance) {
            lines.push(`| ${result.id} | ${result.url} | ${result.title} | ${result.rounds.join(', ') || '-'} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function formatFactsAsMarkdown(facts: PendingReport): string {
    const lines: string[] = [];
    lines.push('## Session Facts');
    lines.push('');
    lines.push(`**Results:** ${facts.total} — ${facts.extracted} with an extracted body, ${facts.unextracted} without`);
    lines.push(`**Sources:** ${facts.sources}`);
    if (facts.sourceList.length) lines.push(`**Source list:** ${facts.sourceList.join(' · ')}`);
    lines.push('');

    if (facts.pending.length) {
        lines.push(`**Awaiting approval:** ${facts.pending.length}`);
        lines.push('');
        lines.push('| # | Source | Body | Verified | Round | Title |');
        lines.push('|---|--------|------|----------|-------|-------|');
        facts.pending.forEach((fact, index) => {
            lines.push(`| ${index} | ${fact.domain || '-'} | ${fact.contentLength} | ${fact.verified ? '✓' : '✗'} | ${fact.round ?? '-'} | ${fact.title || fact.url} |`);
        });
        lines.push('');
    }

    return lines.join('\n');
}

function formatSuggestAsMarkdown(data: any): string {
    const lines: string[] = [];
    lines.push('## Query Suggestion Data');
    lines.push('');
    lines.push(`**Current Stage:** ${data.currentStage}`);
    lines.push('');

    if (data.topEntities?.length) {
        lines.push('### Top Entities');
        lines.push('');
        lines.push('| Entity | Obfuscated Label | Degree | Frequency | Type |');
        lines.push('|--------|------------------|--------|-----------|------|');
        for (const e of data.topEntities.slice(0, 15)) {
            lines.push(`| ${e.label} | ${e.obfuscatedLabel || '-'} | ${e.degree} | ${e.frequency} | ${e.entityType || '-'} |`);
        }
        lines.push('');
    }

    if (data.unexploredDomains?.length) {
        lines.push('### Unexplored Domains');
        lines.push('');
        for (const d of data.unexploredDomains) {
            lines.push(`- ${d}`);
        }
        lines.push('');
    }

    if (data.roundHistory?.length) {
        lines.push('### Round History');
        lines.push('');
        lines.push('| Round | Query | Results |');
        lines.push('|-------|-------|---------|');
        for (const r of data.roundHistory) {
            lines.push(`| ${r.round} | ${r.query} | ${r.resultCount} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function formatStrategyAsMarkdown(data: any): string {
    const lines: string[] = [];
    lines.push('## Search Strategy Info');
    lines.push('');
    lines.push(`**Current Stage:** ${data.currentStage}`);
    lines.push(`**Round:** ${data.roundNumber}`);
    lines.push(`**Growth Rate:** ${data.growthRate.toFixed(2)}`);
    lines.push('');
    lines.push(`**Recommended Engines:** ${data.recommendedEngines?.join(', ') || '-'}`);
    lines.push(`**Recommended Categories:** ${data.recommendedCategories?.join(', ') || '-'}`);
    if (data.transitionReason) {
        lines.push('');
        lines.push(`**Transition Reason:** ${data.transitionReason}`);
    }
    lines.push('');
    return lines.join('\n');
}

function formatSessionReportAsMarkdown(data: any): string {
    const lines: string[] = [];
    lines.push('## Session Report');
    lines.push('');

    // What the session has gathered. The per-round view lives in `dg coverage`
    // and the pending list in `dg --quality`; repeating them here would make
    // three places to keep in step.
    const p = data.pending;
    lines.push(`### Gathered: ${p.total} results from ${p.sources} sources`);
    lines.push(`- With an extracted body: ${p.extracted}`);
    lines.push(`- Awaiting extraction: ${p.unextracted}`);
    lines.push(`- Awaiting approval: ${p.pending.length}`);
    lines.push('');

    // Strategy
    const s = data.strategy;
    lines.push(`### Strategy: ${s.currentStage}`);
    lines.push(`- Round: ${s.roundNumber}`);
    lines.push(`- Growth Rate: ${s.growthRate.toFixed(2)}`);
    lines.push(`- Engines: ${s.recommendedEngines.join(', ')}`);
    lines.push(`- Categories: ${s.recommendedCategories.join(', ')}`);
    if (s.transitionReason) lines.push(`- Transition: ${s.transitionReason}`);
    lines.push('');

    // Top entities
    if (data.suggestions.topEntities?.length) {
        lines.push('### Top Entities');
        lines.push('');
        for (const e of data.suggestions.topEntities.slice(0, 5)) {
            lines.push(`- ${e.label} (degree: ${e.degree}, freq: ${e.frequency})`);
        }
        lines.push('');
    }

    lines.push('For what each round looked at, run `dg coverage <session>`.');
    lines.push('');

    return lines.join('\n');
}

/** Load query strings from session graph history. */
function loadSessionQueryHistory(sessionDir: string): string[] {
    const graph = loadSessionGraph(sessionDir);
    const queries: string[] = [];
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'query' && attrs.query) {
            queries.push(attrs.query);
        }
    });
    return queries;
}

/**
 * Search providers reachable through `--engines` magic words. Each is selected
 * by placing its name in the engine list; every other name goes to SearXNG.
 */
const EXTERNAL_PROVIDERS = ['ollama', 'deepseek'] as const;
type ExternalProvider = typeof EXTERNAL_PROVIDERS[number];

const PROVIDER_IMPLS: Record<ExternalProvider, {
    configured: () => boolean;
    search: (query: string, limit: number) => Promise<SearchResponse>;
}> = {
    ollama: {
        configured: () => Boolean(config.ollamaApiKey),
        search: (query, limit) => new OllamaService({ apiKey: config.ollamaApiKey }).search({ query, limit }),
    },
    deepseek: {
        configured: () => Boolean(config.deepseekApiKey),
        search: (query, limit) => new DeepSeekService({ apiKey: config.deepseekApiKey }).search({ query, limit }),
    },
};

interface ProviderSearchPlan {
    /** Selected providers whose API key is present, in a stable order. */
    usable: ExternalProvider[];
    /** Providers named in `--engines` that the caller cannot reach. */
    unconfigured: ExternalProvider[];
    /** Engine names left for SearXNG once the magic words are removed. */
    sxngEngines: string[];
}

function planProviderSearch(engines: string[]): ProviderSearchPlan {
    const selected = EXTERNAL_PROVIDERS.filter(p => engines.includes(p));
    return {
        usable: selected.filter(p => PROVIDER_IMPLS[p].configured()),
        unconfigured: selected.filter(p => !PROVIDER_IMPLS[p].configured()),
        sxngEngines: engines.filter(e => !EXTERNAL_PROVIDERS.includes(e as ExternalProvider)),
    };
}

/**
 * Run every provider the plan selects for one query. SearXNG is queried unless
 * a configured provider fully covers the request, which keeps a lone
 * `-e ollama` from also hitting SearXNG. The SearXNG response is returned
 * separately because it owns the envelope metadata when it participates.
 */
async function searchOneQuery(
    service: SearXNGService,
    plan: ProviderSearchPlan,
    searchOptions: SearchOptions,
    limit: number
): Promise<{ providerResponses: SearchResponse[]; sxngResponse: SearchResponse | null }> {
    const providerResponses: SearchResponse[] = [];
    for (const provider of plan.usable) {
        providerResponses.push(await PROVIDER_IMPLS[provider].search(searchOptions.query, limit));
    }

    let sxngResponse: SearchResponse | null = null;
    if (plan.usable.length === 0 || plan.sxngEngines.length > 0) {
        sxngResponse = await service.search({
            ...searchOptions,
            engines: plan.sxngEngines.length > 0 ? plan.sxngEngines : searchOptions.engines,
        });
    }

    return { providerResponses, sxngResponse };
}

/** Attribute a result to the tool that produced it, for session origin records. */
function originTool(engine: string): string {
    return EXTERNAL_PROVIDERS.includes(engine as ExternalProvider) ? engine : 'digdig';
}

/**
 * Resolve `--format` for a subcommand.
 *
 * The root program declares `-f, --format` too, and Commander assigns a flag to
 * the program it appears *after* — but a subcommand's own `opts.format` then
 * arrives as `undefined`, while the parent reports its default (`md`). Neither
 * `opts` nor `command.rawArgs` (empty for a nested command) can answer, so the
 * argv handed to `runCli` is carried through `createProgram` and read here.
 */
function subcommandFormat(argv: string[], command: string, fallback?: string): string | undefined {
    const start = argv.indexOf(command);
    if (start === -1) return fallback;

    for (let i = start + 1; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--format' || arg === '-f') return argv[i + 1];
        if (arg.startsWith('--format=')) return arg.slice('--format='.length);
    }
    return fallback;
}

async function runSearch(
    service: SearXNGService,
    options: {
        query?: string;
        queries?: string[];
        engines?: string[];
        categories?: string[];
        limit?: number;
        page?: number;
        language?: string;
        timeRange?: string;
        format?: string;
        session?: string;
        owner?: string;
        desc?: string;
        graph?: string;
        merge?: string;
        redundancy?: 'warn' | 'adjust' | 'skip';
    }
): Promise<number> {
    const queries = options.queries || (options.query ? [options.query] : []);

    if (queries.length === 0) {
        const envelope = createErrorEnvelope(
            'MISSING_QUERY',
            'No search query provided',
            { hint: 'Use: dg "your search query" or dg --queries "q1,q2,q3"' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    if (options.engines && config.allowedEngines.length > 0) {
        const invalid = options.engines.filter(e => !config.allowedEngines.includes(e));
        if (invalid.length > 0) {
            const envelope = createErrorEnvelope(
                'INVALID_ENGINES',
                `Engines not allowed: ${invalid.join(', ')}`,
                { hint: `Allowed engines: ${config.allowedEngines.join(', ')}` }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    }

    // A selected provider without its API key cannot run. Failing loudly beats
    // silently answering from SearXNG, which would make the provider look active.
    if (options.engines) {
        const unconfigured = planProviderSearch(options.engines).unconfigured;
        if (unconfigured.length > 0) {
            const envelope = createErrorEnvelope(
                'PROVIDER_NOT_CONFIGURED',
                `Provider selected but no API key configured: ${unconfigured.join(', ')}`,
                { hint: unconfigured.map(p => p === 'ollama'
                    ? 'Set OLLAMA_API_KEY or add "ollamaApiKey" to digdig.config.json'
                    : 'Set DEEPSEEK_API_KEY or add "deepseekApiKey" to digdig.config.json').join('; ') }
            );
            console.log(JSON.stringify(envelope, null, 2));
            return 1;
        }
    }

    const limit = options.limit ?? config.defaultLimit;

    if (options.session) {
        const resolved = resolveSessionPath(options.session);
        options.session = resolved;
        initSessionDir(resolved, options.owner, options.desc, options.query);
    }

    // Pre-search redundancy check
    if (options.redundancy && options.session) {
        const history = loadSessionQueryHistory(options.session);
        const redundancyConfig: RedundancyConfig = {
            jaccardThreshold: config.redundancyThreshold,
            bigramThreshold: config.redundancyBigramThreshold,
            action: options.redundancy,
        };

        const adjustedQueries: string[] = [];
        const skippedQueries: string[] = [];

        for (const q of queries) {
            const result = checkQueryRedundancy(q, history, redundancyConfig);

            if (result.isRedundant) {
                if (redundancyConfig.action === 'skip') {
                    skippedQueries.push(q);
                    continue;
                } else if (redundancyConfig.action === 'adjust' && result.adjustedQuery) {
                    adjustedQueries.push(result.adjustedQuery);
                } else {
                    // warn — proceed but output warning
                    adjustedQueries.push(q);
                }

                // Output redundancy info
                if (redundancyConfig.action === 'warn' || redundancyConfig.action === 'adjust') {
                    const envelopeContent: Record<string, any> = {
                        redundancyWarning: {
                            query: q,
                            adjustedQuery: result.adjustedQuery,
                            maxSimilarity: result.maxSimilarity,
                            similarQueries: result.similarQueries,
                            action: redundancyConfig.action,
                        },
                    };

                    // Attach advice when action is warn (not adjust, since adjust modifies the query)
                    if (redundancyConfig.action === 'warn') {
                        try {
                            const graph = loadSessionGraph(options.session);
                            const stats = graphStats(graph);

                            if (stats.entities >= 3) {
                                // Graph has matured → deep graph-based advice
                                const sessionResults = loadSessionResults(options.session);
                                const analysis = getSessionAnalysis(graph, sessionResults, getPendingResults(options.session));
                                const topLabels = analysis.suggestions.topEntities
                                    .slice(0, 3)
                                    .map(e => e.label);
                                envelopeContent.advice = {
                                    type: 'graph',
                                    currentStage: analysis.strategy.currentStage,
                                    entityGrowthRate: analysis.strategy.growthRate,
                                    topEntities: topLabels,
                                    unexploredDomains: analysis.suggestions.unexploredDomains.slice(0, 3),
                                    transitionReason: analysis.strategy.transitionReason,
                                };
                            } else {
                                // Graph is still growing → statistical advice
                                const saturation = result.similarQueries.length >= 3
                                    ? 'high'
                                    : result.similarQueries.length >= 2 ? 'medium' : 'low';
                                envelopeContent.advice = {
                                    type: 'statistical',
                                    similarQueryCount: result.similarQueries.length,
                                    totalSessionQueries: history.length,
                                    saturation,
                                    suggestion: saturation === 'high'
                                        ? 'This topic appears saturated: 3+ similar queries all returned results. Consider switching to a sub-topic or a different angle.'
                                        : `Similar to ${result.similarQueries.length} past query(s) at ${(result.maxSimilarity * 100).toFixed(0)}% similarity. Proceed with search, but consider if a different facet might yield more new results.`,
                                };
                            }
                        } catch {
                            // Advice is best-effort enhancement; silence errors
                        }
                    }

                    const envelope = createSuccessEnvelope(envelopeContent);
                    console.error(JSON.stringify(envelope, null, 2));
                }
            } else {
                adjustedQueries.push(q);
            }
        }

        if (skippedQueries.length > 0 && skippedQueries.length === queries.length) {
            // All queries skipped
            const envelope = createSuccessEnvelope({
                message: 'All queries skipped due to redundancy',
                skippedQueries,
            });
            console.log(JSON.stringify(envelope, null, 2));
            return 0;
        }

        // Replace queries with adjusted ones (skipped ones removed)
        queries.length = 0;
        queries.push(...adjustedQueries);
    }

    try {
        // Read the merge file before anything writes, so a bad path cannot leave
        // half a session behind.
        let mergeResults: SearchResult[] | undefined;
        let mergeMeta: { suggestions?: string[]; answers?: string[] } = {};
        if (options.merge) {
            try {
                const parsed = JSON.parse(readFileSync(options.merge, 'utf-8'));
                const payload = parsed.status === 'ok' && parsed.data ? parsed.data : parsed;
                mergeResults = (payload.results || []) as SearchResult[];
                mergeMeta = { suggestions: payload.suggestions, answers: payload.answers };
            } catch {
                console.log(JSON.stringify(createErrorEnvelope(
                    'MERGE_FILE_FAILED',
                    `Failed to read merge file: ${options.merge}`,
                    { hint: 'Ensure the file exists and contains valid search results JSON' }
                ), null, 2));
                return 1;
            }
        }

        // One invocation, N queries: the only difference from a single query is
        // how many responses land in the array.
        const engines = options.engines ?? [];
        const plan = planProviderSearch(engines);
        const responses: SearchResponse[] = [];
        for (const query of queries) {
            const searchOptions: SearchOptions = {
                query,
                engines,
                categories: options.categories,
                limit,
                page: options.page,
                language: options.language,
                timeRange: options.timeRange as any,
            };
            const { providerResponses, sxngResponse } = await searchOneQuery(service, plan, searchOptions, limit);
            responses.push(...providerResponses);
            if (sxngResponse) responses.push(sxngResponse);
        }

        // Snapshot before writing: history must not include this invocation's own
        // results, or every current result votes for itself a second time.
        const sessionSnapshot = options.session ? loadSessionResults(options.session) : undefined;

        const fusion = fuseResults({
            responses,
            mergeResults,
            sessionSnapshot,
            onlyCurrent: Boolean(options.session),
            limit,
            toolFor: engine => originTool(engine),
        });

        let sessionInfo: ReturnType<typeof appendSessionResults> | null = null;
        if (options.session) {
            sessionInfo = appendSessionResults(options.session, fusion.display.map((result, index) => ({
                ...result,
                // The fused position, so `rank` and `fusionScore` describe the same
                // order instead of one provider's and one RRF's.
                rank: index + 1,
                origins: fusion.originsByKey.get(resultUrlKey(result)),
            })));
            injectApprovedResults(options.session, sessionInfo.approvedResults);
            const pendingCount = countPendingResults(options.session);
            if (pendingCount >= 30) {
                console.error(`[session] ${pendingCount} pending results awaiting Agent review. Run --quality to list them.`);
            }
        }

        const meta = mergeEnvelopeMetadata(responses, null);
        for (const suggestion of mergeMeta.suggestions ?? []) {
            if (!meta.suggestions.includes(suggestion)) meta.suggestions.push(suggestion);
        }
        for (const answer of mergeMeta.answers ?? []) {
            if (!meta.answers.includes(answer)) meta.answers.push(answer);
        }

        const outputFormat = (options.format || config.defaultFormat) as 'json' | 'md';
        const displayData = {
            query: queries.length > 1 ? queries.join(' · ') : queries[0],
            queries,
            // The deduplicated candidate pool, not a sum of provider self-reports
            // and not the pre-dedup array length.
            totalResults: fusion.fused.length,
            results: fusion.display,
            answers: meta.answers,
            suggestions: meta.suggestions,
            unresponsiveEngines: meta.unresponsiveEngines,
            ...(sessionInfo ? { session: { dir: options.session, added: sessionInfo.added, total: sessionInfo.total } } : {}),
        };

        if (outputFormat === 'md') {
            console.log(formatOutput(displayData, 'md'));
        } else if (outputFormat === 'json') {
            console.log(JSON.stringify(createSuccessEnvelope({
                ...displayData,
                returnedResults: fusion.display.length,
            }), null, 2));
        } else {
            console.log(formatOutput(displayData, outputFormat));
        }

        // Results are now managed by session (pending -> approved -> graph)
        // Do NOT auto-inject into graph. Use --quality --approve for Agent-controlled injection.

        return 0;
    } catch (error) {
        const envelope = createErrorEnvelope(
            'SEARCH_FAILED',
            error instanceof Error ? error.message : 'Search request failed',
            {
                retryable: true,
                hint: 'Check your network connection and SearXNG server status'
            }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }
}

export function createProgram(argv: string[] = []): Command {
    const program = new Command();

    program
        .name('dg')
        .description('dg (digdig) - Web Search Tool (SearXNG, Ollama, DeepSeek)')
        .version(pkg.version)
        .argument('[query]', 'Search query')
        .option('-e, --engines <engines>', `Comma-separated list of search engines; "${EXTERNAL_PROVIDERS.join('"/"')}" route to non-SearXNG providers`)
        .option('-c, --categories <cats>', 'Comma-separated list of categories')
        .option('-l, --limit <n>', 'Maximum number of results', val => parseInt(val, 10))
        .option('-p, --page <n>', 'Page number for pagination', val => parseInt(val, 10))
        .option('--lang <code>', 'Language code (e.g., en, zh, ja)')
        .option('--time <range>', 'Time range: day, week, month, year, all')
        .option('-f, --format <fmt>', 'Output format: md (default), json')
        .option('--queries <queries...>', 'Multi-query with RRF fusion (comma- or space-separated)')
        .option('--merge <file>', 'Merge new results with previous search JSON')
        .option('--session <dir|new>', 'Session dir, or "new" to auto-create')
        .option('--owner <name>', 'Session owner (stored in meta.json)')
        .option('--desc <text>', 'Session description (stored in meta.json)')
        .option('--graph <file>', 'Save search result metadata to knowledge graph file')
        .option('--redundancy <action>', 'Query redundancy check: warn | adjust | skip')
        .option('--quality', 'List pending results with what the session has gathered, as counted facts')
        .option('--approve-file <path>', 'UTF-8 approval JSON array under this session agent-inputs directory')
        .option('--skip-file <path>', 'UTF-8 skip JSON array under this session agent-inputs directory')
        .option('--unskip-file <path>', 'UTF-8 restore JSON array under this session agent-inputs directory')
        .option('--health', 'Check the SearXNG backend health (Ollama/DeepSeek have no health endpoint)')
        .option('--engines-list', 'List available search engines')
        .option('--categories-list', 'List available categories')
        .allowUnknownOption(false);

    program
        .command('init')
        .description('Interactive configuration setup')
        .action(async () => {
            const code = await initConfig();
            process.exitCode = code;
        });

    program
        .command('extract')
        .description('Extract article content from URLs or session results')
        .option('--urls <url1,url2>', 'URLs to extract content from')
        .option('--session <dir>', 'Extract from session results and merge content back')
        .option('--obscura', 'Use Obscura as fallback for JS-heavy pages')
        .option('--obscura-path <path>', 'Path to Obscura binary')
        .option('--obscura-dump <format>', 'Obscura dump format: html, markdown', 'html')
        .option('--jina', 'Use Jina Reader (r.jina.ai); requires explicit --urls')
        .action(async (opts, command) => {
            const extractor = new ContentExtractor({
                obscura: opts.obscura ?? false,
                obscuraPath: opts.obscuraPath,
                obscuraDumpFormat: opts.obscuraDump === 'markdown' ? 'markdown' : 'html',
                jina: opts.jina ?? false,
            });
            const extractOptions: ExtractOptions = {
                urls: opts.urls?.split(',').map((u: string) => u.trim()).filter(Boolean),
                // Commander resolves a duplicated root/subcommand option on the parent.
                session: opts.session ?? command.parent?.opts().session,
                jina: opts.jina ?? false,
            };
            const code = await runExtract(extractor, extractOptions);
            process.exitCode = code;
        });

    program
        .command('query-graph')
        .argument('<path>', 'Graph file or session name')
        .description('[DEPRECATED] Query subgraph via BFS. Use graph-explore + graph-drill instead.')
        .option('--seeds <s1,s2>', 'Seed nodes for BFS')
        .option('--depth <n>', 'BFS depth (default: 2)', val => parseInt(val, 10), 2)
        .option('--strategy <strategy>', 'Sampling strategy: augmented_chain | dual_core_bridge | community_core_path | deep_chain | mixed')
        .option('-f, --format <fmt>', 'Output format: md, json')
        .action(async (path, opts) => {
            console.warn('[DEPRECATED] query-graph is deprecated. Use graph-explore + graph-drill instead.');
            const graphFormat = opts.format === 'json' ? 'json' : 'md';
            const code = await runQueryGraph({
                graphFile: path,
                seeds: opts.seeds?.split(',').map((s: string) => s.trim()).filter(Boolean) || [],
                depth: opts.depth ?? 2,
                format: graphFormat,
                strategy: opts.strategy,
            });
            process.exitCode = code;
        });

    program
        .command('graph-add')
        .argument('<session>', 'Session directory or name')
        .description('Add semantic entities/edges supported by approved extracted result IDs.')
        .requiredOption('--data-file <path>', 'UTF-8 JSON under this session agent-inputs directory')
        .action(async (session, opts) => {
            const code = await runGraphAdd({
                session,
                dataFile: opts.dataFile,
            });
            process.exitCode = code;
        });

    program
        .command('results-add')
        .argument('<session>', 'Session directory or name')
        .description('Import external search records or extracted bodies into a session')
        .requiredOption('--kind <kind>', 'Import kind: search or extracted')
        .requiredOption('--data-file <path>', 'UTF-8 JSON under this session agent-inputs directory')
        .option('--query <query>', 'Discovery query (may instead be supplied per item)')
        .option('--tool <tool>', 'Origin tool (may instead be supplied per item)')
        .addHelpText('after', `
Examples:
  dg results-add my-session --kind search --tool exa --query "async runtime" --data-file .digdig/sessions/my-session/agent-inputs/results.json

Search imports await extraction; extracted imports await approval.`)
        .action(async (session, opts) => {
            const code = await runResultsAdd({
                session,
                kind: opts.kind,
                dataFile: opts.dataFile,
                query: opts.query,
                tool: opts.tool,
            });
            process.exitCode = code;
        });

    program
        .command('doc-index')
        .argument('<path>', 'Document path to index')
        .description('Index local documents for BM25 search')
        .option('-t, --type <exts>', 'File extensions (comma-separated)', 'md,txt')
        .addHelpText('after', `
Examples:
  dg doc-index ./docs
  dg doc-index --type md,txt ~/notes`)
        .action(async (path, opts) => {
            const code = await runDocIndex({
                path,
                extensions: opts.type?.split(',').map((e: string) => e.trim()).filter(Boolean),
            });
            process.exitCode = code;
        });

    program
        .command('doc-search')
        .argument('<session>', 'Session directory or name')
        .argument('<query>', 'Search query')
        .description('Search local documents and inject results into session')
        .requiredOption('--path <path>', 'Document path to search')
        .option('-k, --top <n>', 'Top-K results', val => parseInt(val, 10), 10)
        .option('--boost <field:w,...>', 'Field weights (e.g. title:3,headings:2,content:1)', 'title:3,headings:2,content:1')
        .addHelpText('after', `
Examples:
  dg doc-search my-session "async" --path ./docs
  dg doc-search my-session -k 5 "deploy" --path ~/notes`)
        .action(async (session, query, opts) => {
            const code = await runDocSearch({
                session,
                query,
                path: opts.path,
                topK: opts.top,
                boost: opts.boost,
            });
            process.exitCode = code;
        });

    program
        .command('session-list')
        .description('List all sessions')
        .action(async () => {
            const code = await runSessionList();
            process.exitCode = code;
        });

    program
        .command('session-delete')
        .argument('[names]', 'Comma-separated session names to delete')
        .option('--older <h>', 'Delete sessions older than N hours', val => parseFloat(val))
        .action(async (names, opts) => {
            const nameList = (names || '').split(',').map((n: string) => n.trim()).filter(Boolean);
            const code = await runSessionDelete(nameList, opts.older);
            process.exitCode = code;
        });

    program
        .command('graph-obfuscate')
        .argument('<path>', 'Graph file or session name')
        .description('List obfuscation candidates or apply fallback rules (experimental)')
        .option('--list', 'List entities needing obfuscation (default)')
        .option('--fallback-rules', 'Apply simple rule-based obfuscation (experimental)')
        .option('--skip-types <t1,t2>', 'Entity types to skip')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  dg graph-obfuscate my-session --list
  dg graph-obfuscate my-session --fallback-rules --format md

Note: --fallback-rules is experimental and may produce low-quality obfuscation labels.
Recommended workflow: use --list to get candidates, then have an LLM generate obfuscated labels,
and write them back via graph-add.`)
        .action(async (path, opts) => {
            const code = await runGraphObfuscateCommand({
                graphFile: path,
                list: opts.list ?? !opts.fallbackRules,
                fallbackRules: opts.fallbackRules ?? false,
                format: opts.format === 'md' ? 'md' : 'json',
                skipEntityTypes: opts.skipTypes?.split(',').map((t: string) => t.trim()).filter(Boolean),
            });
            process.exitCode = code;
        });

    program
        .command('graph-preprocess')
        .argument('<session>', 'Session directory or name')
        .description('Preprocess session data: TF-IDF, co-occurrence, entity context, and result provenance')
        .option('--top <n>', 'Top N terms to return', val => parseInt(val, 10), 30)
        .option('--co-occurrence-threshold <n>', 'Min co-occurrence count', val => parseInt(val, 10), 2)
        .option('--max-terms <n>', 'Max terms for co-occurrence matrix', val => parseInt(val, 10), 50)
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  dg graph-preprocess my-session
  dg graph-preprocess my-session --top 50 --format md`)
        .action(async (session, opts) => {
            const sessionDir = resolveSessionPath(session);
            const result = graphPreprocess(sessionDir, {
                top: opts.top,
                coOccurrenceThreshold: opts.coOccurrenceThreshold,
                maxTermsForCoOccurrence: opts.maxTerms,
            });
            if (opts.format === 'md') {
                console.log(formatPreprocessAsMarkdown(result));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope(result), null, 2));
            }
            process.exitCode = 0;
        });

    program
        .command('coverage')
        .argument('<session>', 'Session directory or name')
        .description('Report what the session has looked at, as counted facts (rounds, queries, repetition, distinctive terms)')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Reports what has been searched and what came back, without deciding what it means.
Reads results.json only, so it works before any result has been approved.

Examples:
  dg coverage my-session
  dg coverage my-session --format md`)
        .action(async (session, opts, command: Command) => {
            const code = await runCoverage({
                session,
                format: subcommandFormat(argv, command.name(), opts.format) === 'md' ? 'md' : 'json',
            });
            process.exitCode = code;
        });

    program
        .command('suggest-queries')
        .argument('<session>', 'Session directory or name')
        .description('Output query suggestion data for Agent follow-up query generation')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  dg suggest-queries my-session
  dg suggest-queries my-session --format md`)
        .action(async (session, opts) => {
            const sessionDir = resolveSessionPath(session);
            const graph = loadSessionGraph(sessionDir);
            const results = loadSessionResults(sessionDir);
            const stage = determineSearchStage(graph);

            const data = generateQuerySuggestions(graph, results, stage);

            if (opts.format === 'md') {
                console.log(formatSuggestAsMarkdown(data));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope(data), null, 2));
            }
            process.exitCode = 0;
        });

    program
        .command('strategy-info')
        .argument('<session>', 'Session directory or name')
        .description('Output current search stage recommendation (broad vs targeted)')
        .option('--broad-rounds <n>', 'Rounds before transition check', val => parseInt(val, 10), 2)
        .option('--transition-threshold <n>', 'Growth rate threshold for stage transition', parseFloat, 0.2)
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  dg strategy-info my-session
  dg strategy-info my-session --format md`)
        .action(async (session, opts) => {
            const sessionDir = resolveSessionPath(session);
            const graph = loadSessionGraph(sessionDir);

            const info = getStrategyInfo(graph, {
                broadRounds: opts.broadRounds,
                transitionThreshold: opts.transitionThreshold,
            });

            if (opts.format === 'md') {
                console.log(formatStrategyAsMarkdown(info));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope(info), null, 2));
            }
            process.exitCode = 0;
        });

    program
        .command('session-report')
        .argument('<session>', 'Session directory or name')
        .description('Show what the session has gathered and how far the search has moved')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  dg session-report my-session
  dg session-report my-session --format md`)
        .action(async (session, opts) => {
            const sessionDir = resolveSessionPath(session);
            const graph = loadSessionGraph(sessionDir);
            const results = loadSessionResults(sessionDir);

            const analysis = getSessionAnalysis(graph, results, getPendingResults(sessionDir));

            if (opts.format === 'md') {
                console.log(formatSessionReportAsMarkdown(analysis));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope(analysis), null, 2));
            }
            process.exitCode = 0;
        });

    program
        .command('graph-explore')
        .argument('<session>', 'Session directory or name')
        .description('List all relations around a seed entity (Agent graph navigation)')
        .requiredOption('--seed <entity>', 'Seed entity label to explore')
        .option('-f, --format <fmt>', 'Output format: md (default), json')
        .addHelpText('after', `
Examples:
  dg graph-explore my-session --seed "tokio"
  dg graph-explore my-session --seed "tokio" --format json

See also: graph-drill, graph-search`)
        .action(async (session, opts) => {
            const code = await runGraphExplore({
                session,
                seed: opts.seed,
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exitCode = code;
        });

    program
        .command('graph-drill')
        .argument('<session>', 'Session directory or name')
        .description('Follow specific relations from an entity (Agent graph navigation)')
        .requiredOption('--seed <entity>', 'Seed entity label')
        .requiredOption('--relations <list>', 'Comma-separated relation types to follow')
        .option('-f, --format <fmt>', 'Output format: md (default), json')
        .addHelpText('after', `
Examples:
  dg graph-drill my-session --seed "tokio" --relations "alternative_to"
  dg graph-drill my-session --seed "tokio" --relations "alternative_to,depends_on" --format json

See also: graph-explore`)
        .action(async (session, opts) => {
            const code = await runGraphDrill({
                session,
                seed: opts.seed,
                relations: opts.relations.split(',').map((r: string) => r.trim()).filter(Boolean),
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exitCode = code;
        });

    program
        .command('graph-traverse')
        .argument('<session>', 'Session directory or name')
        .description('Traverse a reasoning path by path node ID (requires path nodes from graph-preprocess)')
        .requiredOption('--path <path-id>', 'Path node ID (e.g. p:chain_001)')
        .option('-f, --format <fmt>', 'Output format: md (default), json')
        .addHelpText('after', `
Examples:
  dg graph-traverse my-session --path "p:chain_001"
  dg graph-traverse my-session --path "p:chain_001" --format json

Note: Path nodes are created by graph-preprocess. If no paths exist,
the command will list available path node IDs.`)
        .action(async (session, opts) => {
            const code = await runGraphTraverse({
                session,
                pathId: opts.path,
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exitCode = code;
        });

    program
        .command('graph-search')
        .argument('<session>', 'Session directory or name')
        .description('Keyword search across entity labels (discover entities before exploring)')
        .requiredOption('--keyword <term>', 'Search keyword')
        .option('-l, --limit <n>', 'Max results', val => parseInt(val, 10), 10)
        .option('-f, --format <fmt>', 'Output format: md (default), json')
        .addHelpText('after', `
Examples:
  dg graph-search my-session --keyword "async"
  dg graph-search my-session --keyword "tokio" --limit 5 --format json

See also: graph-explore (for viewing relations of a known entity)`)
        .action(async (session, opts) => {
            const code = await runGraphSearch({
                session,
                keyword: opts.keyword,
                limit: opts.limit,
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exitCode = code;
        });

    // ── Claim commands ──────────────────────────────────────────

    program
        .command('claim-add')
        .argument('<session>', 'Session directory or name')
        .description('Add claims (single or batch) with auto evidence-search')
        .option('--claim-file <path>', 'UTF-8 JSON file with one claim')
        .option('--claims-file <path>', 'UTF-8 JSON file with a claim array')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  dg claim-add my-session --claim-file .digdig/sessions/my-session/agent-inputs/claim.json
  dg claim-add my-session --claims-file .digdig/sessions/my-session/agent-inputs/claims.json`)
        .action(async (session, opts) => {
            const code = await runClaimAdd(session, {
                claimFile: opts.claimFile,
                claimsFile: opts.claimsFile,
                format: opts.format,
            });
            process.exitCode = code;
        });

    program
        .command('claim-list')
        .argument('<session>', 'Session directory or name')
        .description('List claims')
        .option('--status <status>', 'Filter by status: pending, verifying, reviewed')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .action(async (session, opts) => {
            const code = await runClaimList(session, {
                status: opts.status,
                format: opts.format,
            });
            process.exitCode = code;
        });

    program
        .command('evidence-search')
        .argument('<session>', 'Session directory or name')
        .description('Search candidate evidence for a claim (read-only)')
        .requiredOption('--claim-id <id>', 'Claim ID')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .action(async (session, opts) => {
            const code = await runEvidenceSearch(session, {
                claimId: opts.claimId,
                format: opts.format,
            });
            process.exitCode = code;
        });

    program
        .command('evidence-verify')
        .argument('<session>', 'Session directory or name')
        .description('Confirm evidence + submit stance + optional auto-policy')
        .requiredOption('--claim-id <id>', 'Claim ID')
        .requiredOption('--evidence-file <path>', 'UTF-8 JSON file with evidence object under this session agent-inputs directory')
        .requiredOption('--stance <s>', 'Stance: support, refute, insufficient')
        .requiredOption('--reason <text>', 'Judgement rationale')
        .option('--confidence <n>', 'Confidence 0-1', parseFloat)
        .option('--complete', 'Auto-trigger policy aggregation after this evidence')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .action(async (session, opts) => {
            const code = await runEvidenceVerify(session, {
                claimId: opts.claimId,
                evidenceFile: opts.evidenceFile,
                stance: opts.stance,
                reason: opts.reason,
                confidence: opts.confidence,
                complete: opts.complete ?? false,
                format: opts.format,
            });
            process.exitCode = code;
        });

    program
        .command('evidence-list')
        .argument('<session>', 'Session directory or name')
        .description('List evidence for a claim')
        .requiredOption('--claim-id <id>', 'Claim ID')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .action(async (session, opts) => {
            const code = await runEvidenceList(session, {
                claimId: opts.claimId,
                format: opts.format,
            });
            process.exitCode = code;
        });

    program
        .command('verdict-list')
        .argument('<session>', 'Session directory or name')
        .description('List verdicts for a claim')
        .requiredOption('--claim-id <id>', 'Claim ID')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .action(async (session, opts) => {
            const code = await runVerdictList(session, {
                claimId: opts.claimId,
                format: opts.format,
            });
            process.exitCode = code;
        });

    program
        .command('policy-aggregate')
        .argument('<session>', 'Session directory or name')
        .description('Run policy aggregation (manual, or auto via evidence-verify --complete)')
        .option('--claim-id <id>', 'Aggregate only a specific claim')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .action(async (session, opts) => {
            const code = await runPolicyAggregate(session, {
                claimId: opts.claimId,
                format: opts.format,
            });
            process.exitCode = code;
        });

    program
        .command('review-list')
        .argument('<session>', 'Session directory or name')
        .description('List reviews')
        .option('--status <status>', 'Filter: approved, needsReview, rejected')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .action(async (session, opts) => {
            const code = await runReviewList(session, {
                status: opts.status,
                format: opts.format,
            });
            process.exitCode = code;
        });

    return program;
}

export async function runCli(args: string[], service: SearXNGService): Promise<number | null> {
    const program = createProgram(args);

    // Custom action for default command (search)
    // Commander passes the [query] argument as first param, then opts
    program.action(async (query, opts) => {
        const queryString = query || '';

        if (opts.version) {
            console.log(program.version());
            process.exitCode = 0;
            return;
        }

        if (opts.health) {
            const health = await service.healthCheck();
            const envelope = health.status === 'healthy'
                ? createSuccessEnvelope(health)
                : createErrorEnvelope(
                    'HEALTH_CHECK_FAILED',
                    health.error || 'SearXNG server is not responding',
                    { hint: `Check if SearXNG is running at ${config.baseUrl}` }
                );
            console.log(JSON.stringify(envelope, null, 2));
            process.exitCode = health.status === 'healthy' ? 0 : 1;
            return;
        }

        if (opts.quality) {
            if (!opts.session) {
                const envelope = createErrorEnvelope(
                    'QUALITY_NO_SESSION',
                    '--quality requires --session',
                    { hint: 'Use: dg --session <name> --quality' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                process.exitCode = 1;
                return;
            }
            const sessionDir = resolveSessionPath(opts.session);
            const sessionResults = loadSessionResults(sessionDir);
            const sessionGraph = loadSessionGraph(sessionDir);

            const readSelections = (option: string, file: string | undefined): Array<{ id: string; revision: number }> | undefined => {
                const input = readSessionJsonInput(sessionDir, [{ option, value: file, file: true }]);
                if (!input.ok || !Array.isArray(input.value) || !input.value.every(item => typeof item === 'object' && item !== null && typeof item.id === 'string' && Number.isSafeInteger(item.revision))) {
                    console.log(JSON.stringify(createErrorEnvelope(
                        input.ok ? 'INVALID_APPROVAL_SELECTION' : input.code,
                        input.ok ? `${option} must contain an array of {id, revision}` : input.message,
                    ), null, 2));
                    return undefined;
                }
                return input.value as Array<{ id: string; revision: number }>;
            };

            const applySkip = (option: string, file: string | undefined, skipped: boolean): boolean => {
                const selections = readSelections(option, file);
                if (!selections) return false;
                const result = setSkipped(sessionDir, selections, skipped);
                if (result.error) {
                    console.log(JSON.stringify(createErrorEnvelope(result.error.code, result.error.message, { details: { error: result.error } }), null, 2));
                    return false;
                }
                console.log(JSON.stringify(createSuccessEnvelope({ changed: result.changed, skipped, results: result.results.map(item => ({ id: item.id, revision: item.revision, skippedAt: item.skippedAt })) }), null, 2));
                return true;
            };

            if (opts.skipFile || opts.unskipFile) {
                if (opts.skipFile && opts.unskipFile) {
                    console.log(JSON.stringify(createErrorEnvelope('MULTIPLE_SKIP_ACTIONS', 'Use only one of --skip-file or --unskip-file'), null, 2));
                    process.exitCode = 1;
                    return;
                }
                process.exitCode = applySkip(opts.skipFile ? '--skip-file' : '--unskip-file', opts.skipFile ?? opts.unskipFile, Boolean(opts.skipFile)) ? 0 : 1;
                return;
            }

            // Get pending results for Agent review
            const pending = getPendingResults(sessionDir);
            const facts = buildPendingReport(sessionResults, pending);

            // Approval is allowed only after reporting what is waiting and how
            // much of it carries a body.
            if (opts.approveFile) {
                const selections = readSelections('--approve-file', opts.approveFile);
                if (!selections) {
                    process.exitCode = 1;
                    return;
                }
                const selectedResults = selections
                    .map(selection => sessionResults.find(result => result.id === selection.id))
                    .filter((result): result is typeof pending[number] => Boolean(result))
                    .map(result => describeResult(result));
                const approval = approveResults(sessionDir, selections);

                if (approval.error) {
                    console.log(JSON.stringify(createErrorEnvelope(
                        approval.error.code,
                        approval.error.message,
                        {
                            details: { facts, selectedResults, error: approval.error },
                            hint: 'Run dg extract --session <session> for unverified results, then review and approve again.',
                        }
                    ), null, 2));
                    process.exitCode = 1;
                    return;
                }

                // Inject only the results selected by this approval action.
                const injectInfo = injectApprovedResults(sessionDir, approval.approvedResults);

                console.log(JSON.stringify(createSuccessEnvelope({
                    approved: approval.approved,
                    total: approval.total,
                    nodesAdded: injectInfo.nodesAdded,
                    edgesAdded: injectInfo.edgesAdded,
                    facts,
                    selectedResults,
                    message: `Approved ${approval.approved} results, injected into graph (+${injectInfo.nodesAdded} nodes, +${injectInfo.edgesAdded} edges)`,
                }), null, 2));
                process.exitCode = 0;
                return;
            }

            if (pending.length === 0) {
                // Nothing to approve: the counts still describe the session.
                const outputFormat = (opts.format || config.defaultFormat) as 'json' | 'md';
                if (outputFormat === 'md') {
                    console.log(formatFactsAsMarkdown(facts));
                } else {
                    console.log(JSON.stringify(createSuccessEnvelope(facts), null, 2));
                }
                process.exitCode = 0;
                return;
            }

            const outputFormat = (opts.format || config.defaultFormat) as 'json' | 'md';
            if (outputFormat === 'json') {
                // The body under review, alongside the per-result facts. The
                // preview is deliberately `content` and not the display
                // fallback: this list exists so the Agent can read the
                // extracted text before approving it.
                console.log(JSON.stringify(createSuccessEnvelope({
                    ...facts,
                    pending: facts.pending.map((fact, index) => ({
                        ...fact,
                        index,
                        contentPreview: pending[index].content?.slice(0, 300),
                    })),
                    hint: 'Agent reviews content and approves with the id/revision objects returned here.',
                }), null, 2));
            } else {
                console.log(formatFactsAsMarkdown(facts));
                console.log('\n## Pending Results (awaiting Agent approval)\n');
                for (let i = 0; i < pending.length; i++) {
                    const r = pending[i];
                    console.log(`${i}. [${r.title || 'No Title'}](${r.url}) [${r.source || 'digdig'}]`);
                    if (r.content) {
                        const preview = r.content.slice(0, 300).replace(/\s+/g, ' ');
                        console.log(`   Preview: ${preview}${r.content.length > 300 ? '...' : ''}`);
                    }
                }
                console.log('\n**Agent writes ID/revision selections to session agent-inputs, then uses --approve-file.**');
            }
            process.exitCode = 0;
            return;
        }

        if (opts.enginesList) {
            try {
                const engines = await service.getEngines();
                const configuredProviders = EXTERNAL_PROVIDERS.filter(p => PROVIDER_IMPLS[p].configured());
                if (engines.length === 0 && configuredProviders.length === 0) {
                    const envelope = createErrorEnvelope(
                        'ENGINES_FETCH_EMPTY',
                        'No engines returned from SearXNG server',
                        { hint: 'Check if SearXNG server is properly configured' }
                    );
                    console.log(JSON.stringify(envelope, null, 2));
                    process.exitCode = 1;
                    return;
                }
                engines.push(...configuredProviders);
                const envelope = createSuccessEnvelope({ engines, source: 'server' });
                console.log(JSON.stringify(envelope, null, 2));
                process.exitCode = 0;
            } catch (error) {
                const envelope = createErrorEnvelope(
                    'ENGINES_FETCH_FAILED',
                    error instanceof Error ? error.message : 'Failed to fetch engines',
                    { hint: 'Check your network connection and SearXNG server status' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                process.exitCode = 1;
            }
            return;
        }

        if (opts.categoriesList) {
            try {
                const categories = await service.getCategories();
                if (categories.length === 0) {
                    const envelope = createErrorEnvelope(
                        'CATEGORIES_FETCH_EMPTY',
                        'No categories returned from SearXNG server',
                        { hint: 'Check if SearXNG server is properly configured' }
                    );
                    console.log(JSON.stringify(envelope, null, 2));
                    process.exitCode = 1;
                    return;
                }
                const envelope = createSuccessEnvelope({ categories, source: 'server' });
                console.log(JSON.stringify(envelope, null, 2));
                process.exitCode = 0;
            } catch (error) {
                const envelope = createErrorEnvelope(
                    'CATEGORIES_FETCH_FAILED',
                    error instanceof Error ? error.message : 'Failed to fetch categories',
                    { hint: 'Check your network connection and SearXNG server status' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                process.exitCode = 1;
            }
            return;
        }

        const queries = opts.queries
            ?.flatMap((value: string) => value.split(','))
            .map((q: string) => q.trim())
            .filter(Boolean);
        const code = await runSearch(service, {
            query: queryString,
            queries,
            engines: opts.engines?.split(',').map((e: string) => e.trim()).filter(Boolean),
            categories: opts.categories?.split(',').map((c: string) => c.trim()).filter(Boolean),
            limit: opts.limit,
            page: opts.page,
            language: opts.lang,
            timeRange: opts.time,
            format: opts.format,
            session: opts.session,
            owner: opts.owner,
            desc: opts.desc,
            graph: opts.graph,
            merge: opts.merge,
            redundancy: opts.redundancy as 'warn' | 'adjust' | 'skip' | undefined,
        });
        process.exitCode = code;
    });

    try {
        await program.parseAsync(args, { from: 'user' });
    } catch (error) {
        if (error instanceof Error && error.name === 'CommanderError') {
            console.error(error.message);
            return 1;
        }
        throw error;
    }

    return null;
}
