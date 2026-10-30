import { describe, it, expect } from 'vitest';
import {
    getSessionAnalysis,
    checkNewQueryRedundancy,
} from '../../src/deep/iteration-data.js';
import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { SessionResult } from '../../src/deep/session.js';

function buildSessionForAnalysis(): {
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>;
    results: SessionResult[];
} {
    const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    const results: SessionResult[] = [];

    // Round 1: good results
    graph.mergeNode('q:rust async', { type: 'query', label: 'rust async', query: 'rust async', round: 1 });
    graph.mergeNode('e:tokio', { type: 'entity', label: 'tokio', entityType: 'runtime', frequency: 8, obfuscatedLabel: 'an async runtime' });

    for (let i = 1; i <= 5; i++) {
        const url = `https://domain${i}.com/page${i}`;
        const rId = `r:url${i}`;
        graph.mergeNode(rId, { type: 'result', label: `Result ${i}`, url, title: `Result ${i}` });
        graph.addEdge('q:rust async', rId, { relation: 'yields', weight: 1 });
        if (i <= 2) graph.addEdge(rId, 'e:tokio', { relation: 'mentions', weight: 1 });
        results.push({ url, title: `Result ${i}`, content: 'x'.repeat(250) });
    }

    // Round 2: poor results
    graph.mergeNode('q:very specific', { type: 'query', label: 'very specific', query: 'very specific', round: 2 });
    const url6 = 'https://domain1.com/page6';
    graph.mergeNode('r:url6', { type: 'result', label: 'Result 6', url: url6, title: 'Result 6' });
    graph.addEdge('q:very specific', 'r:url6', { relation: 'yields', weight: 1 });
    results.push({ url: url6, title: 'Result 6' });

    return { graph, results };
}

describe('iteration-data', () => {
    describe('getSessionAnalysis', () => {
        it('reports counted facts, strategy, and suggestions', () => {
            const { graph, results } = buildSessionForAnalysis();
            const analysis = getSessionAnalysis(graph, results, []);

            expect(analysis.pending.total).toBe(results.length);
            expect(analysis.pending.pending).toEqual([]);
            expect(analysis.strategy).toBeDefined();
            expect(analysis.strategy.currentStage).toBeDefined();
            expect(analysis.suggestions).toBeDefined();
            expect(analysis.suggestions.topEntities).toBeDefined();
        });

        it('carries no judgement of its own', () => {
            // The point of removing the quality layer: nothing here says
            // whether the session is going well.
            const { graph, results } = buildSessionForAnalysis();
            const analysis = getSessionAnalysis(graph, results, []);

            expect(analysis).not.toHaveProperty('quality');
            expect(analysis).not.toHaveProperty('recovery');
        });

        it('strategy info reflects graph state', () => {
            const { graph, results } = buildSessionForAnalysis();
            const analysis = getSessionAnalysis(graph, results, []);

            expect(analysis.strategy.roundNumber).toBe(2);
            expect(analysis.strategy.recommendedEngines.length).toBeGreaterThan(0);
        });

        it('suggestions include top entities from graph', () => {
            const { graph, results } = buildSessionForAnalysis();
            const analysis = getSessionAnalysis(graph, results, []);

            expect(analysis.suggestions.topEntities.length).toBeGreaterThan(0);
            expect(analysis.suggestions.topEntities[0].label).toBe('tokio');
        });

        it('counts the pending list it is given', () => {
            const { graph, results } = buildSessionForAnalysis();
            const analysis = getSessionAnalysis(graph, results, results);

            expect(analysis.pending.pending).toHaveLength(results.length);
        });

        it('accepts optional config overrides', () => {
            const { graph, results } = buildSessionForAnalysis();
            const analysis = getSessionAnalysis(graph, results, [], {
                strategyConfig: { broadRounds: 1, transitionThreshold: 0.1 },
            });

            expect(analysis.strategy).toBeDefined();
        });
    });

    describe('checkNewQueryRedundancy', () => {
        it('detects redundant query from graph history', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:rust async', { type: 'query', label: 'rust async', query: 'rust async', round: 1 });

            const result = checkNewQueryRedundancy('rust async', graph);

            expect(result.isRedundant).toBe(true);
            expect(result.maxSimilarity).toBe(1);
        });

        it('returns not redundant for novel query', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:rust async', { type: 'query', label: 'rust async', query: 'rust async', round: 1 });

            const result = checkNewQueryRedundancy('python machine learning', graph);

            expect(result.isRedundant).toBe(false);
        });

        it('uses default jaccard threshold 0.7', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('q:rust async', { type: 'query', label: 'rust async', query: 'rust async', round: 1 });

            // Partial overlap but below threshold
            const result = checkNewQueryRedundancy('python async', graph);

            // "python async" vs "rust async" — word overlap is 1/3 ≈ 0.33 < 0.7
            // But with bigram Jaccard (short queries ≤2 words), "async" is common
            expect(result.isRedundant).toBe(false);
        });
    });
});
