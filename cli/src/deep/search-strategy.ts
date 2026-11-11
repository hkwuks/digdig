/**
 * Two-stage search strategy (GraphWalker-inspired).
 *
 * Stage 1 — Broad Exploration: general engines, wide scope.
 * Stage 2 — Targeted Deep-Dive: specialized engines, obfuscated queries.
 *
 * Transition signal: entity richness growth rate slows below threshold.
 * CLI only outputs stage recommendation — Agent decides whether to follow.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { SearchStage } from './query-suggest.js';

// ── Types ─────────────────────────────────────────────────────────

export interface StrategyConfig {
    broadEngines: string[];
    deepEngines: string[];
    broadRounds: number;
    autoTransition: boolean;
    transitionThreshold: number;
}

export interface StrategyInfo {
    currentStage: SearchStage;
    recommendedEngines: string[];
    recommendedCategories: string[];
    roundNumber: number;
    growthRate: number;
    transitionReason?: string;
}

const DEFAULT_CONFIG: StrategyConfig = {
    broadEngines: ['google', 'bing', 'duckduckgo'],
    deepEngines: ['arxiv', 'semantic_scholar', 'github', 'stackoverflow'],
    broadRounds: 2,
    autoTransition: true,
    transitionThreshold: 0.2,
};

// ── Stage determination ───────────────────────────────────────────

/** Attribute each entity to its earliest currently valid supporting source. */
function entityCountsByRound(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>
): Map<number, number> {
    const counts = new Map<number, number>();

    const roundForResult = (resultId: string): number | undefined => {
        if (!graph.hasNode(resultId)) return undefined;
        const attrs = graph.getNodeAttributes(resultId);
        const rounds = attrs.origins?.map(origin => origin.round).filter((round): round is number => Number.isSafeInteger(round) && round! > 0) ?? [];
        return rounds.length ? Math.min(...rounds) : undefined;
    };

    graph.forEachNode((_node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type !== 'entity') return;
        const sources = attrs.sourceResultIds?.filter(id => !attrs.pendingSourceResultIds?.includes(id));
        const rounds = sources?.map(roundForResult).filter((round): round is number => round !== undefined) ?? [];
        if (rounds.length > 0) {
            const bucket = Math.min(...rounds);
            counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
        }
    });

    return counts;
}

/** Count total query rounds in the graph. */
function countQueryRounds(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): number {
    let maxRound = 0;
    graph.forEachNode((_node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'query' && attrs.round != null) {
            maxRound = Math.max(maxRound, attrs.round);
        }
    });
    return maxRound;
}

/** Compute entity richness growth rate between last two rounds.
 *  growthRate = (newEntitiesThisRound - newEntitiesLastRound) / max(newEntitiesLastRound, 1)
 *  When growth rate slows below threshold, it signals transition to deep-dive. */
export function computeGrowthRate(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    latestRound = countQueryRounds(graph),
): number {
    const countsByRound = entityCountsByRound(graph);
    if (latestRound < 2) {
        // Not enough data → assume still growing
        return 1.0;
    }

    const thisRound = latestRound;
    const lastRound = latestRound - 1;

    const newThis = countsByRound.get(thisRound) ?? 0;
    const newLast = countsByRound.get(lastRound) ?? 0;

    return (newThis - newLast) / Math.max(newLast, 1);
}

/** Determine current search stage based on session state.
 *  Returns the stage recommendation — Agent may choose to ignore. */
export function determineSearchStage(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: Partial<StrategyConfig>,
    latestRound = countQueryRounds(graph),
): SearchStage {
    const c = { ...DEFAULT_CONFIG, ...config };

    if (!c.autoTransition) {
        return 'broad_exploration';
    }

    const rounds = latestRound;
    if (rounds < c.broadRounds) {
        return 'broad_exploration';
    }

    const growthRate = computeGrowthRate(graph, latestRound);
    if (growthRate < c.transitionThreshold) {
        return 'targeted_deep_dive';
    }

    return 'broad_exploration';
}

/** Get full strategy info for Agent decision-making. */
export function getStrategyInfo(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: Partial<StrategyConfig>,
    latestRound = countQueryRounds(graph),
): StrategyInfo {
    const c = { ...DEFAULT_CONFIG, ...config };
    const currentStage = determineSearchStage(graph, c, latestRound);
    const growthRate = computeGrowthRate(graph, latestRound);
    const roundNumber = latestRound;

    let transitionReason: string | undefined;
    if (currentStage === 'targeted_deep_dive') {
        transitionReason = `Entity richness growth rate (${growthRate.toFixed(2)}) below threshold (${c.transitionThreshold}) after ${roundNumber} rounds`;
    }

    return {
        currentStage,
        recommendedEngines: currentStage === 'broad_exploration' ? c.broadEngines : c.deepEngines,
        recommendedCategories: currentStage === 'broad_exploration' ? ['general'] : ['science', 'it'],
        roundNumber,
        growthRate,
        transitionReason,
    };
}
