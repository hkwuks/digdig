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
import { initConfig } from './init.js';
import { runExtract, ExtractOptions } from './commands/extract.js';
import { runQueryGraph, QueryGraphOptions } from './commands/query-graph.js';
import { runGraphAdd, GraphAddOptions } from './commands/graph-add.js';
import { runResultsAdd, ResultsAddOptions } from './commands/results-add.js';
import { runDocIndex } from './commands/doc-index.js';
import { runDocSearch } from './commands/doc-search.js';
import { runGraphObfuscateCommand, GraphObfuscateOptions } from './commands/graph-obfuscate.js';
import { ContentExtractor } from './deep/extractor.js';
import { rrf } from './deep/rrf.js';
import { normalizeUrl, resultUrlKey } from './deep/dedupe.js';
import { deserializeGraph, graphStats, GraphNodeAttrs, GraphEdgeAttrs } from './deep/graph.js';
import { initSessionDir, resolveSessionPath, appendSessionResults, loadSessionResults, loadSessionGraph, countPendingResults, getPendingResults, approveResults, injectApprovedResults, hasVerifiedContent, setSkipped } from './deep/session.js';
import { runSessionList, runSessionDelete, getDefaultSessionRoot } from './commands/session.js';
import { graphPreprocess } from './deep/graph-preprocess.js';
import { checkQueryRedundancy, RedundancyConfig } from './deep/query-redundancy.js';
import { assessLatestResultQuality, assessResultQuality, QualityThresholds } from './deep/quality-assess.js';
import { generateQuerySuggestions } from './deep/query-suggest.js';
import { determineSearchStage, getStrategyInfo } from './deep/search-strategy.js';
import { analyzeRecoveryOptions, RecoveryAnalysis, RoundQuality } from './deep/recovery-analysis.js';
import { getSessionAnalysis } from './deep/iteration-data.js';
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

            if (r.content) {
                lines.push(r.content);
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

function formatQualityAsMarkdown(data: any): string {
    const lines: string[] = [];
    lines.push('## Result Quality Assessment');
    lines.push('');
    const verdictEmoji: Record<string, string> = { good: '✓', acceptable: '△', poor: '✗' };
    lines.push(`**Verdict:** ${data.verdict.toUpperCase()} ${verdictEmoji[data.verdict] || ''}`);
    lines.push('');

    const breakdown = data.breakdown;
    if (breakdown) {
        lines.push('| Indicator | Value | Threshold | Pass |');
        lines.push('|-----------|-------|-----------|------|');
        const indicators = ['contentDepth', 'sourceDiversity', 'novelty'];
        const labels: Record<string, string> = {
            contentDepth: 'Content Depth',
            sourceDiversity: 'Source Diversity',
            novelty: 'Novelty',
        };
        for (const key of indicators) {
            const ind = breakdown[key];
            if (ind) {
                const valueStr = key === 'novelty' ? ind.value.toFixed(2) : String(Math.round(ind.value * 100) / 100);
                const thStr = key === 'novelty' ? ind.threshold.toFixed(2) : String(ind.threshold);
                lines.push(`| ${labels[key] || key} | ${valueStr} | ${thStr} | ${ind.pass ? '✓' : '✗'} |`);
            }
        }
        lines.push('');
    }

    if (data.failedIndicators?.length > 0) {
        lines.push(`**Failed:** ${data.failedIndicators.join(', ')}`);
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

    if (data.qualityLastRound) {
        lines.push(`**Last Round Quality:** ${data.qualityLastRound.verdict}`);
        if (data.qualityLastRound.failedIndicators?.length) {
            lines.push(` (failed: ${data.qualityLastRound.failedIndicators.join(', ')})`);
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

function formatRecoveryAsMarkdown(data: RecoveryAnalysis): string {
    const lines: string[] = [];
    lines.push('## Recovery Analysis');
    lines.push('');
    const verdictEmoji: Record<string, string> = { good: '✓', acceptable: '△', poor: '✗' };
    lines.push(`**Quality:** ${data.qualityScore.verdict.toUpperCase()} ${verdictEmoji[data.qualityScore.verdict] || ''}`);
    lines.push(`**Consecutive Failures:** ${data.recentFailures}`);
    lines.push('');

    if (data.lastSuccessfulRound) {
        lines.push(`**Last Successful Round:** Round ${data.lastSuccessfulRound.round} — "${data.lastSuccessfulRound.query}"`);
        lines.push('');
    }

    if (data.availableStrategies.length > 0) {
        lines.push('### Available Strategies');
        lines.push('');
        for (const s of data.availableStrategies) {
            lines.push(`**${s.strategy}**`);
            lines.push(`- Reason: ${s.reason}`);
            lines.push(`- Suggestion: ${s.suggestion}`);
            if (s.backtrackTo) {
                lines.push(`- Backtrack to: Round ${s.backtrackTo.round} — "${s.backtrackTo.query}"`);
            }
            lines.push('');
        }
    }

    if (data.roundQualityHistory.length > 0) {
        lines.push('### Quality History');
        lines.push('');
        lines.push('| Round | Query | Verdict | Failed |');
        lines.push('|-------|-------|---------|--------|');
        for (const r of data.roundQualityHistory) {
            lines.push(`| ${r.round} | ${r.query} | ${r.verdict} | ${r.failedIndicators.join(', ') || '-'} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function formatSessionReportAsMarkdown(data: any): string {
    const lines: string[] = [];
    lines.push('## Session Report');
    lines.push('');

    // Quality summary
    const q = data.quality;
    const verdictEmoji: Record<string, string> = { good: '✓', acceptable: '△', poor: '✗' };
    lines.push(`### Quality: ${q.verdict.toUpperCase()} ${verdictEmoji[q.verdict] || ''}`);
    lines.push('');
    if (q.breakdown) {
        const indicators = ['contentDepth', 'entityRichness', 'sourceDiversity', 'novelty'];
        const labels: Record<string, string> = {
            contentDepth: 'Content Depth',
            entityRichness: 'Entity Richness', sourceDiversity: 'Source Diversity', novelty: 'Novelty',
        };
        for (const key of indicators) {
            const ind = q.breakdown[key];
            if (ind) {
                const valueStr = key === 'novelty' ? ind.value.toFixed(2) : String(Math.round(ind.value * 100) / 100);
                lines.push(`- ${labels[key]}: ${valueStr} (threshold: ${ind.threshold}) ${ind.pass ? '✓' : '✗'}`);
            }
        }
        lines.push('');
    }

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

    // Recovery hint
    if (q.verdict !== 'good') {
        lines.push(`> Recovery: ${data.recovery.availableStrategies.length} strategies available. Use \`sxng recovery-analysis <session>\` for details.`);
        lines.push('');
    }

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
            { hint: 'Use: sxng "your search query" or sxng --queries "q1,q2,q3"' }
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
                                const analysis = getSessionAnalysis(graph, sessionResults);
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
        if (queries.length === 1 && !options.merge) {
            const searchOptions: SearchOptions = {
                query: queries[0],
                engines: options.engines,
                categories: options.categories,
                limit,
                page: options.page,
                language: options.language,
                timeRange: options.timeRange as any,
            };

            // Split engines: 'ollama' goes to OllamaService, rest to SearXNG
            const engines = searchOptions.engines ?? [];
            const useOllama = engines.includes('ollama') && config.ollamaApiKey;
            const sxngEngines = engines.filter(e => e !== 'ollama');

            let results: SearchResponse;
            if (useOllama) {
                const ollama = new OllamaService({ apiKey: config.ollamaApiKey });
                const ollamaResp = await ollama.search({ query: queries[0], limit });
                if (sxngEngines.length > 0) {
                    // Also search SearXNG with remaining engines, merge
                    const sxngResp = await service.search({ ...searchOptions, engines: sxngEngines });
                    results = {
                        ...sxngResp,
                        results: [...ollamaResp.results, ...sxngResp.results],
                        numberOfResults: ollamaResp.results.length + sxngResp.numberOfResults,
                    };
                } else {
                    results = ollamaResp;
                }
            } else {
                results = await service.search(searchOptions);
            }

            let sessionInfo: ReturnType<typeof appendSessionResults> | null = null;
            if (options.session) {
                sessionInfo = appendSessionResults(options.session, results.results.map(result => ({
                    ...result,
                    origins: [{ tool: result.engine === 'ollama' ? 'ollama' : 'sxng', engine: result.engine, query: queries[0] }],
                })));
                injectApprovedResults(options.session, sessionInfo.approvedResults);
                // Check pending count and warn if >= 30
                const pendingCount = countPendingResults(options.session);
                if (pendingCount >= 30) {
                    console.error(`[session] ${pendingCount} pending results awaiting Agent quality assessment. Run --quality to evaluate.`);
                }
            }

            const outputFormat = (options.format || config.defaultFormat) as 'json' | 'md';

            let displayResults = results.results;
            if (options.session) {
                const allSessionResults = loadSessionResults(options.session);
                const rankings = [
                    results.results.map(r => ({ ...r, id: resultUrlKey(r) })),
                    allSessionResults.map(r => ({ ...r, id: resultUrlKey(r) })),
                ];
                const fused = rrf(rankings);
                const urlMap = new Map<string, SearchResult>();
                for (const r of allSessionResults) urlMap.set(resultUrlKey(r), r as SearchResult);
                // Keep current search content when it overlaps with older session data.
                for (const r of results.results) urlMap.set(resultUrlKey(r), r);
                displayResults = fused
                    .map(item => {
                        const original = urlMap.get(item.id);
                        return original ? { ...original, fusionScore: item.score } : null;
                    })
                    .filter(Boolean) as SearchResult[];
                if (limit > 0) displayResults = displayResults.slice(0, limit);
            }

            const displayData = {
                query: results.query,
                totalResults: results.numberOfResults,
                results: displayResults,
                answers: results.answers,
                suggestions: results.suggestions,
                unresponsiveEngines: results.unresponsiveEngines,
                ...(sessionInfo ? { session: { dir: options.session, added: sessionInfo.added, total: sessionInfo.total } } : {}),
            };

            if (outputFormat === 'md') {
                console.log(formatOutput(displayData, 'md'));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope({
                    ...displayData,
                    returnedResults: displayResults.length,
                }), null, 2));
            }

            // Results are now managed by session (pending -> approved -> graph)
            // Do NOT auto-inject into graph. Use --quality --approve for Agent-controlled injection.

            return 0;
        }

        const allResponses: SearchResponse[] = [];
        const engines = options.engines ?? [];
        const useOllama = engines.includes('ollama') && config.ollamaApiKey;
        const sxngEngines = engines.filter(e => e !== 'ollama');

        for (const query of queries) {
            const searchOptions: SearchOptions = {
                query,
                engines: sxngEngines.length > 0 ? sxngEngines : engines,
                categories: options.categories,
                limit,
                page: options.page,
                language: options.language,
                timeRange: options.timeRange as any,
            };

            if (useOllama) {
                const ollama = new OllamaService({ apiKey: config.ollamaApiKey });
                const ollamaResp = await ollama.search({ query, limit });
                allResponses.push(ollamaResp);
            }
            if (sxngEngines.length > 0 || !useOllama) {
                const response = await service.search(searchOptions);
                allResponses.push(response);
            }
        }

        let rankings = allResponses.map(resp =>
            resp.results.map((r: SearchResult) => ({ id: normalizeUrl(r.url), ...r }))
        );

        let mergeData: any = null;
        if (options.merge) {
            try {
                const raw = readFileSync(options.merge, 'utf-8');
                mergeData = JSON.parse(raw);
                let mergeResults = mergeData;
                if (mergeData.status === 'ok' && mergeData.data) {
                    mergeResults = mergeData.data;
                }
                const historicalResults = (mergeResults.results || []);
                if (historicalResults.length > 0) {
                    rankings.push(
                        historicalResults.map((r: any) => ({ id: normalizeUrl(r.url), ...r }))
                    );
                }
            } catch (error) {
                const envelope = createErrorEnvelope(
                    'MERGE_FILE_FAILED',
                    `Failed to read merge file: ${options.merge}`,
                    { hint: 'Ensure the file exists and contains valid search results JSON' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                return 1;
            }
        }

        const rrfFused = rrf(rankings);

        const allResults: SearchResult[] = [];
        const allSuggestions: string[] = [];
        const allAnswers: string[] = [];
        const allUnresponsive: string[] = [];

        for (const resp of allResponses) {
            allResults.push(...resp.results);
            for (const s of resp.suggestions) {
                if (!allSuggestions.includes(s)) allSuggestions.push(s);
            }
            for (const a of resp.answers) {
                if (!allAnswers.includes(a)) allAnswers.push(a);
            }
            for (const u of resp.unresponsiveEngines) {
                const name = Array.isArray(u) ? u[0] : u;
                if (!allUnresponsive.includes(name)) allUnresponsive.push(name);
            }
        }

        if (mergeData) {
            let mergeResults = mergeData;
            if (mergeData.status === 'ok' && mergeData.data) {
                mergeResults = mergeData.data;
            }
            const historical = mergeResults.results || [];
            allResults.push(...historical);
            if (mergeResults.suggestions) {
                for (const s of mergeResults.suggestions) {
                    if (!allSuggestions.includes(s)) allSuggestions.push(s);
                }
            }
            if (mergeResults.answers) {
                for (const a of mergeResults.answers) {
                    if (!allAnswers.includes(a)) allAnswers.push(a);
                }
            }
        }

        const urlMap = new Map<string, SearchResult>();
        for (const r of allResults) {
            const norm = normalizeUrl(r.url);
            if (!urlMap.has(norm)) urlMap.set(norm, r);
        }

        let fusedResults = rrfFused
            .map((item: { id: string; score: number }) => {
                const original = urlMap.get(item.id);
                if (!original) return null;
                return { ...original, fusionScore: item.score };
            })
            .filter(Boolean) as SearchResult[];

        if (limit > 0) {
            fusedResults = fusedResults.slice(0, limit);
        }

        let sessionInfo: ReturnType<typeof appendSessionResults> | null = null;
        if (options.session) {
            const originsByUrl = new Map<string, Array<{ tool: string; engine?: string; query: string }>>();
            for (const response of allResponses) {
                for (const result of response.results) {
                    const key = normalizeUrl(result.url);
                    const origins = originsByUrl.get(key) || [];
                    origins.push({ tool: result.engine === 'ollama' ? 'ollama' : 'sxng', engine: result.engine, query: response.query });
                    originsByUrl.set(key, origins);
                }
            }
            sessionInfo = appendSessionResults(options.session, fusedResults.map(result => ({
                ...result,
                origins: originsByUrl.get(normalizeUrl(result.url)),
            })));
            injectApprovedResults(options.session, sessionInfo.approvedResults);
            // Check pending count and warn if >= 30
            const pendingCount = countPendingResults(options.session);
            if (pendingCount >= 30) {
                console.error(`[session] ${pendingCount} pending results awaiting Agent quality assessment. Run --quality to evaluate.`);
            }
        }

        const displayQuery = queries.length > 1 ? queries.join(' · ') : queries[0];
        const outputFormat = (options.format || config.defaultFormat) as 'json' | 'md';

        const displayData = {
            query: displayQuery,
            queries,
            totalResults: allResults.length,
            results: fusedResults,
            answers: allAnswers,
            suggestions: allSuggestions,
            unresponsiveEngines: allUnresponsive,
            ...(sessionInfo ? { session: { dir: options.session, added: sessionInfo.added, total: sessionInfo.total } } : {}),
        };

        if (outputFormat === 'md') {
            console.log(formatOutput(displayData, 'md'));
        } else if (outputFormat === 'json') {
            console.log(JSON.stringify(createSuccessEnvelope({
                ...displayData,
                returnedResults: fusedResults.length,
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

export function createProgram(): Command {
    const program = new Command();

    program
        .name('sxng')
        .description('SearXNG CLI - Web Search Tool')
        .version(pkg.version)
        .argument('[query]', 'Search query')
        .option('-e, --engines <engines>', 'Comma-separated list of search engines')
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
        .option('--quality', 'Assess result quality for current session')
        .option('--threshold-override <json>', 'Override quality thresholds (JSON, e.g. \'{"contentDepth":100}\')')
        .option('--approve-file <path>', 'UTF-8 approval JSON array under this session agent-inputs directory')
        .option('--skip-file <path>', 'UTF-8 skip JSON array under this session agent-inputs directory')
        .option('--unskip-file <path>', 'UTF-8 restore JSON array under this session agent-inputs directory')
        .option('--health', 'Check SearXNG server health')
        .option('--engines-list', 'List available search engines')
        .option('--categories-list', 'List available categories')
        .allowUnknownOption(false);

    program
        .command('init')
        .description('Interactive configuration setup')
        .action(async () => {
            const code = await initConfig();
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
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
  sxng results-add my-session --kind search --tool exa --query "async runtime" --data-file .sxng/sessions/my-session/agent-inputs/results.json

Search imports await extraction; extracted imports await approval.`)
        .action(async (session, opts) => {
            const code = await runResultsAdd({
                session,
                kind: opts.kind,
                dataFile: opts.dataFile,
                query: opts.query,
                tool: opts.tool,
            });
            process.exit(code);
        });

    program
        .command('doc-index')
        .argument('<path>', 'Document path to index')
        .description('Index local documents for BM25 search')
        .option('-t, --type <exts>', 'File extensions (comma-separated)', 'md,txt')
        .addHelpText('after', `
Examples:
  sxng doc-index ./docs
  sxng doc-index --type md,txt ~/notes`)
        .action(async (path, opts) => {
            const code = await runDocIndex({
                path,
                extensions: opts.type?.split(',').map((e: string) => e.trim()).filter(Boolean),
            });
            process.exit(code);
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
  sxng doc-search my-session "async" --path ./docs
  sxng doc-search my-session -k 5 "deploy" --path ~/notes`)
        .action(async (session, query, opts) => {
            const code = await runDocSearch({
                session,
                query,
                path: opts.path,
                topK: opts.top,
                boost: opts.boost,
            });
            process.exit(code);
        });

    program
        .command('session-list')
        .description('List all sessions')
        .action(async () => {
            const code = await runSessionList();
            process.exit(code);
        });

    program
        .command('session-delete')
        .argument('[names]', 'Comma-separated session names to delete')
        .option('--older <h>', 'Delete sessions older than N hours', val => parseFloat(val))
        .action(async (names, opts) => {
            const nameList = (names || '').split(',').map((n: string) => n.trim()).filter(Boolean);
            const code = await runSessionDelete(nameList, opts.older);
            process.exit(code);
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
  sxng graph-obfuscate my-session --list
  sxng graph-obfuscate my-session --fallback-rules --format md

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
            process.exit(code);
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
  sxng graph-preprocess my-session
  sxng graph-preprocess my-session --top 50 --format md`)
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
            process.exit(0);
        });

    program
        .command('suggest-queries')
        .argument('<session>', 'Session directory or name')
        .description('Output query suggestion data for Agent follow-up query generation')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  sxng suggest-queries my-session
  sxng suggest-queries my-session --format md`)
        .action(async (session, opts) => {
            const sessionDir = resolveSessionPath(session);
            const graph = loadSessionGraph(sessionDir);
            const results = loadSessionResults(sessionDir);
            const stage = determineSearchStage(graph);
            const quality = assessLatestResultQuality(results);

            const data = generateQuerySuggestions(graph, results, stage, quality);

            if (opts.format === 'md') {
                console.log(formatSuggestAsMarkdown(data));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope(data), null, 2));
            }
            process.exit(0);
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
  sxng strategy-info my-session
  sxng strategy-info my-session --format md`)
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
            process.exit(0);
        });

    program
        .command('recovery-analysis')
        .argument('<session>', 'Session directory or name')
        .description('Output recovery strategy analysis for Agent decision-making')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  sxng recovery-analysis my-session
  sxng recovery-analysis my-session --format md`)
        .action(async (session, opts) => {
            const sessionDir = resolveSessionPath(session);
            const graph = loadSessionGraph(sessionDir);
            const results = loadSessionResults(sessionDir);
            const quality = assessLatestResultQuality(results);

            const analysis = analyzeRecoveryOptions(graph, results, quality);

            if (opts.format === 'md') {
                console.log(formatRecoveryAsMarkdown(analysis));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope(analysis), null, 2));
            }
            process.exit(0);
        });

    program
        .command('session-report')
        .argument('<session>', 'Session directory or name')
        .description('Show session quality history and stage progression')
        .option('-f, --format <fmt>', 'Output format: json (default), md')
        .addHelpText('after', `
Examples:
  sxng session-report my-session
  sxng session-report my-session --format md`)
        .action(async (session, opts) => {
            const sessionDir = resolveSessionPath(session);
            const graph = loadSessionGraph(sessionDir);
            const results = loadSessionResults(sessionDir);

            const analysis = getSessionAnalysis(graph, results);

            if (opts.format === 'md') {
                console.log(formatSessionReportAsMarkdown(analysis));
            } else {
                console.log(JSON.stringify(createSuccessEnvelope(analysis), null, 2));
            }
            process.exit(0);
        });

    program
        .command('graph-explore')
        .argument('<session>', 'Session directory or name')
        .description('List all relations around a seed entity (Agent graph navigation)')
        .requiredOption('--seed <entity>', 'Seed entity label to explore')
        .option('-f, --format <fmt>', 'Output format: md (default), json')
        .addHelpText('after', `
Examples:
  sxng graph-explore my-session --seed "tokio"
  sxng graph-explore my-session --seed "tokio" --format json

See also: graph-drill, graph-search`)
        .action(async (session, opts) => {
            const code = await runGraphExplore({
                session,
                seed: opts.seed,
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exit(code);
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
  sxng graph-drill my-session --seed "tokio" --relations "alternative_to"
  sxng graph-drill my-session --seed "tokio" --relations "alternative_to,depends_on" --format json

See also: graph-explore`)
        .action(async (session, opts) => {
            const code = await runGraphDrill({
                session,
                seed: opts.seed,
                relations: opts.relations.split(',').map((r: string) => r.trim()).filter(Boolean),
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exit(code);
        });

    program
        .command('graph-traverse')
        .argument('<session>', 'Session directory or name')
        .description('Traverse a reasoning path by path node ID (requires path nodes from graph-preprocess)')
        .requiredOption('--path <path-id>', 'Path node ID (e.g. p:chain_001)')
        .option('-f, --format <fmt>', 'Output format: md (default), json')
        .addHelpText('after', `
Examples:
  sxng graph-traverse my-session --path "p:chain_001"
  sxng graph-traverse my-session --path "p:chain_001" --format json

Note: Path nodes are created by graph-preprocess. If no paths exist,
the command will list available path node IDs.`)
        .action(async (session, opts) => {
            const code = await runGraphTraverse({
                session,
                pathId: opts.path,
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exit(code);
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
  sxng graph-search my-session --keyword "async"
  sxng graph-search my-session --keyword "tokio" --limit 5 --format json

See also: graph-explore (for viewing relations of a known entity)`)
        .action(async (session, opts) => {
            const code = await runGraphSearch({
                session,
                keyword: opts.keyword,
                limit: opts.limit,
                format: opts.format === 'json' ? 'json' : 'md',
            });
            process.exit(code);
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
  sxng claim-add my-session --claim-file .sxng/sessions/my-session/agent-inputs/claim.json
  sxng claim-add my-session --claims-file .sxng/sessions/my-session/agent-inputs/claims.json`)
        .action(async (session, opts) => {
            const code = await runClaimAdd(session, {
                claimFile: opts.claimFile,
                claimsFile: opts.claimsFile,
                format: opts.format,
            });
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
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
            process.exit(code);
        });

    return program;
}

export async function runCli(args: string[], service: SearXNGService): Promise<number | null> {
    const program = createProgram();

    // Custom action for default command (search)
    // Commander passes the [query] argument as first param, then opts
    program.action(async (query, opts) => {
        const queryString = query || '';

        if (opts.version) {
            console.log(program.version());
            process.exit(0);
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
            process.exit(health.status === 'healthy' ? 0 : 1);
            return;
        }

        if (opts.quality) {
            if (!opts.session) {
                const envelope = createErrorEnvelope(
                    'QUALITY_NO_SESSION',
                    '--quality requires --session',
                    { hint: 'Use: sxng --session <name> --quality' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                process.exit(1);
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
                    process.exit(1);
                    return;
                }
                process.exit(applySkip(opts.skipFile ? '--skip-file' : '--unskip-file', opts.skipFile ?? opts.unskipFile, Boolean(opts.skipFile)) ? 0 : 1);
                return;
            }

            let thresholdOverride: Partial<QualityThresholds> | undefined;
            if (opts.thresholdOverride) {
                try {
                    thresholdOverride = JSON.parse(opts.thresholdOverride);
                } catch {
                    const envelope = createErrorEnvelope(
                        'INVALID_THRESHOLD_OVERRIDE',
                        '--threshold-override must be valid JSON',
                        { hint: 'Example: \'{"contentDepth":100}\'' }
                    );
                    console.log(JSON.stringify(envelope, null, 2));
                    process.exit(1);
                    return;
                }
            }

            // Get pending results for Agent review
            const pending = getPendingResults(sessionDir);

            // For novelty calculation, only compare against approved/historical results
            const approvedResults = sessionResults.filter(r => r.status === 'approved' && !r.skippedAt && hasVerifiedContent(r));
            const priorResults = approvedResults.length > 0 ? approvedResults : [];

            const quality = assessResultQuality(
                pending,
                priorResults,
                thresholdOverride
            );
            const describeResult = (result: typeof pending[number], index?: number) => ({
                ...(index === undefined ? {} : { index }),
                id: result.id,
                revision: result.revision,
                url: result.url,
                source: result.source || 'sxng',
                contentLength: result.content?.length ?? 0,
                extractedAt: result.extractedAt,
                verified: hasVerifiedContent(result),
            });

            // Approval is allowed only after reporting current quality and verification state.
            if (opts.approveFile) {
                const selections = readSelections('--approve-file', opts.approveFile);
                if (!selections) {
                    process.exit(1);
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
                            details: { quality, selectedResults, error: approval.error },
                            hint: 'Run sxng extract --session <session> for unverified results, then review and approve again.',
                        }
                    ), null, 2));
                    process.exit(1);
                    return;
                }

                // Inject only the results selected by this approval action.
                const injectInfo = injectApprovedResults(sessionDir, approval.approvedResults);

                console.log(JSON.stringify(createSuccessEnvelope({
                    approved: approval.approved,
                    total: approval.total,
                    nodesAdded: injectInfo.nodesAdded,
                    edgesAdded: injectInfo.edgesAdded,
                    quality,
                    selectedResults,
                    message: `Approved ${approval.approved} results, injected into graph (+${injectInfo.nodesAdded} nodes, +${injectInfo.edgesAdded} edges)`,
                }), null, 2));
                process.exit(0);
                return;
            }

            if (pending.length === 0) {
                // No pending results, just show current quality
                const quality = assessResultQuality(
                    sessionResults,
                    priorResults,
                    thresholdOverride
                );

                const outputFormat = (opts.format || config.defaultFormat) as 'json' | 'md';
                if (outputFormat === 'md') {
                    console.log(formatQualityAsMarkdown(quality));
                } else {
                    console.log(JSON.stringify(createSuccessEnvelope(quality), null, 2));
                }
                process.exit(0);
                return;
            }

            const outputFormat = (opts.format || config.defaultFormat) as 'json' | 'md';
            if (outputFormat === 'json') {
                // JSON output includes pending results with indices for Agent
                console.log(JSON.stringify(createSuccessEnvelope({
                    quality,
                    pendingResults: pending.map((r, i) => ({
                        index: i,
                        id: r.id,
                        revision: r.revision,
                        title: r.title,
                        url: r.url,
                        source: r.source || 'sxng',
                        status: r.status,
                        contentPreview: r.content ? r.content.slice(0, 300) : undefined,
                        contentLength: r.content?.length ?? 0,
                        domain: (() => { try { return new URL(r.url).hostname; } catch { return ''; } })(),
                        extractedAt: r.extractedAt,
                        verified: hasVerifiedContent(r),
                    })),
                    hint: 'Agent reviews content and approves with the id/revision objects returned here.',
                }), null, 2));
            } else {
                console.log(formatQualityAsMarkdown(quality));
                console.log('\n## Pending Results (awaiting Agent approval)\n');
                for (let i = 0; i < pending.length; i++) {
                    const r = pending[i];
                    console.log(`${i}. [${r.title || 'No Title'}](${r.url}) [${r.source || 'sxng'}]`);
                    if (r.content) {
                        const preview = r.content.slice(0, 300).replace(/\s+/g, ' ');
                        console.log(`   Preview: ${preview}${r.content.length > 300 ? '...' : ''}`);
                    }
                }
                console.log('\n**Agent writes ID/revision selections to session agent-inputs, then uses --approve-file.**');
            }
            process.exit(0);
            return;
        }

        if (opts.enginesList) {
            try {
                const engines = await service.getEngines();
                if (engines.length === 0 && !config.ollamaApiKey) {
                    const envelope = createErrorEnvelope(
                        'ENGINES_FETCH_EMPTY',
                        'No engines returned from SearXNG server',
                        { hint: 'Check if SearXNG server is properly configured' }
                    );
                    console.log(JSON.stringify(envelope, null, 2));
                    process.exit(1);
                    return;
                }
                if (config.ollamaApiKey) engines.push('ollama');
                const envelope = createSuccessEnvelope({ engines, source: 'server' });
                console.log(JSON.stringify(envelope, null, 2));
                process.exit(0);
            } catch (error) {
                const envelope = createErrorEnvelope(
                    'ENGINES_FETCH_FAILED',
                    error instanceof Error ? error.message : 'Failed to fetch engines',
                    { hint: 'Check your network connection and SearXNG server status' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                process.exit(1);
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
                    process.exit(1);
                    return;
                }
                const envelope = createSuccessEnvelope({ categories, source: 'server' });
                console.log(JSON.stringify(envelope, null, 2));
                process.exit(0);
            } catch (error) {
                const envelope = createErrorEnvelope(
                    'CATEGORIES_FETCH_FAILED',
                    error instanceof Error ? error.message : 'Failed to fetch categories',
                    { hint: 'Check your network connection and SearXNG server status' }
                );
                console.log(JSON.stringify(envelope, null, 2));
                process.exit(1);
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
        process.exit(code);
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
