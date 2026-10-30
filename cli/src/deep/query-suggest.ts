/**
 * Query suggestion data generation for deep search sessions.
 *
 * CLI outputs analysis data (entities, domains, history, quality)
 * for Agent to use when generating follow-up queries.
 * CLI does NOT auto-generate queries — Agent controls LLM interaction.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { SessionResult } from './session.js';
import { getEntityDegree } from './degree-utils.js';
import { sourceKey } from './dedupe.js';

// ── Types ─────────────────────────────────────────────────────────

export interface TopEntity {
    label: string;
    obfuscatedLabel?: string;
    degree: number;
    frequency: number;
    entityType?: string;
}

export interface RoundHistoryEntry {
    round: number;
    query: string;
    resultCount: number;
}

export type SearchStage = 'broad_exploration' | 'targeted_deep_dive';

export interface QuerySuggestionData {
    topEntities: TopEntity[];
    unexploredDomains: string[];
    currentStage: SearchStage;
    roundHistory: RoundHistoryEntry[];
}

// ── Domain extraction ─────────────────────────────────────────────

/** Known specialized domains for deep-dive search */
const SPECIALIZED_DOMAINS = [
    'arxiv.org',
    'semanticscholar.org',
    'github.com',
    'stackoverflow.com',
    'docs.rs',
    'npmjs.com',
    'pypi.org',
    'crates.io',
    'medium.com',
    'dev.to',
    'reddit.com',
    'hackernews.com',
];

// ── Suggestion generation ─────────────────────────────────────────

/** Generate query suggestion data from session context.
 *  Returns analysis for Agent — CLI does NOT auto-generate queries. */
export function generateQuerySuggestions(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    sessionResults: SessionResult[],
    currentStage: SearchStage
): QuerySuggestionData {
    // Collect top entities sorted by degree × frequency descending
    const topEntities = collectTopEntities(graph);

    // Detect unexplored domains
    const exploredDomains = new Set<string>();
    for (const r of sessionResults) {
        const domain = sourceKey(r.url);
        if (domain) exploredDomains.add(domain);
    }
    const unexploredDomains = SPECIALIZED_DOMAINS.filter(d => !exploredDomains.has(d));

    // Build round history from query nodes in graph
    const roundHistory = buildRoundHistory(graph, sessionResults);

    return {
        topEntities,
        unexploredDomains,
        currentStage,
        roundHistory,
    };
}

/** Collect entity nodes sorted by degree × frequency descending */
function collectTopEntities(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>
): TopEntity[] {
    const entities: TopEntity[] = [];

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type !== 'entity') return;

        const degree = getEntityDegree(graph, node);
        const frequency = attrs.frequency ?? 1;

        entities.push({
            label: attrs.label,
            obfuscatedLabel: attrs.obfuscatedLabel,
            degree,
            frequency,
            entityType: attrs.entityType,
        });
    });

    // Sort by degree × frequency descending
    return entities.sort((a, b) => (b.degree * b.frequency) - (a.degree * a.frequency));
}

/** Build round history from query nodes in graph */
function buildRoundHistory(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    sessionResults: SessionResult[]
): RoundHistoryEntry[] {
    const entries: RoundHistoryEntry[] = [];

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type !== 'query' || !attrs.query) return;

        // Count results yielded by this query via edges
        let resultCount = 0;
        graph.forEachOutNeighbor(node, (neighbor: string) => {
            const nAttrs = graph.getNodeAttributes(neighbor);
            if (nAttrs.type === 'result') resultCount++;
        });

        entries.push({
            round: attrs.round ?? entries.length + 1,
            query: attrs.query,
            resultCount,
        });
    });

    // Sort by round number
    return entries.sort((a, b) => a.round - b.round);
}
