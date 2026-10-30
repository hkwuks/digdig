/**
 * Unified interface for all deep search iteration data commands.
 *
 * Composes the individual data modules into a single analysis call:
 * - checkQueryRedundancy
 * - buildPendingReport
 * - generateQuerySuggestions
 * - getStrategyInfo
 *
 * Agent can call getSessionAnalysis() to get a snapshot of the session state
 * for decision-making. It reports what is there and what has been searched;
 * it does not say whether that is enough.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { SessionResult } from './session.js';
import { PendingReport, buildPendingReport } from './pending-facts.js';
import { QuerySuggestionData, SearchStage, generateQuerySuggestions } from './query-suggest.js';
import { StrategyConfig, StrategyInfo, getStrategyInfo } from './search-strategy.js';
import { RedundancyConfig, RedundancyResult, checkQueryRedundancy } from './query-redundancy.js';

// ── Types ─────────────────────────────────────────────────────────

export interface SessionAnalysis {
    pending: PendingReport;
    strategy: StrategyInfo;
    suggestions: QuerySuggestionData;
}

// ── Unified analysis ──────────────────────────────────────────────

/** Get a snapshot of the current session state.
 *  Combines counted facts, strategy info, and query suggestions. */
export function getSessionAnalysis(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    sessionResults: SessionResult[],
    pending: SessionResult[],
    options?: { strategyConfig?: Partial<StrategyConfig> }
): SessionAnalysis {
    // Counted facts about what the session has gathered.
    const facts = buildPendingReport(sessionResults, pending);

    // Strategy info
    const strategy = getStrategyInfo(graph, options?.strategyConfig);

    // Query suggestions
    const suggestions = generateQuerySuggestions(
        graph,
        sessionResults,
        strategy.currentStage,
    );

    return { pending: facts, strategy, suggestions };
}

/** Check a new query for redundancy before execution.
 *  Standalone convenience function — also available via query-redundancy.ts. */
export function checkNewQueryRedundancy(
    newQuery: string,
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: Partial<RedundancyConfig>
): RedundancyResult {
    const history: string[] = [];
    graph.forEachNode((_node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'query' && attrs.query) {
            history.push(attrs.query);
        }
    });

    return checkQueryRedundancy(newQuery, history, {
        jaccardThreshold: config?.jaccardThreshold ?? 0.7,
        bigramThreshold: config?.bigramThreshold,
        action: config?.action ?? 'warn',
    });
}
