import { describe, it, expect } from 'vitest';
import {
    generateQuerySuggestions,
    TopEntity,
    QuerySuggestionData,
} from '../../src/deep/query-suggest.js';
import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { SessionResult } from '../../src/deep/session.js';

function buildGraphWithEntitiesAndQueries(): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();

    // Query nodes
    graph.mergeNode('q:rust_async', {
        type: 'query',
        label: 'rust async',
        query: 'rust async',
        round: 1,
    });
    graph.mergeNode('q:tokio_runtime', {
        type: 'query',
        label: 'tokio runtime',
        query: 'tokio runtime',
        round: 2,
    });

    // Result nodes
    graph.mergeNode('r:url1', { type: 'result', label: 'Rust Async', url: 'https://a.com/1', title: 'Rust Async' });
    graph.mergeNode('r:url2', { type: 'result', label: 'Tokio Guide', url: 'https://b.com/2', title: 'Tokio Guide' });
    graph.mergeNode('r:url3', { type: 'result', label: 'Async Std', url: 'https://c.com/3', title: 'Async Std' });

    // Entity nodes with varying degree/frequency
    graph.mergeNode('e:tokio', {
        type: 'entity',
        label: 'tokio',
        entityType: 'runtime',
        frequency: 8,
        obfuscatedLabel: 'a popular async runtime for a systems language',
    });
    graph.mergeNode('e:async_std', {
        type: 'entity',
        label: 'async-std',
        entityType: 'runtime',
        frequency: 5,
        obfuscatedLabel: 'an alternative async runtime',
    });
    graph.mergeNode('e:rust', {
        type: 'entity',
        label: 'rust',
        entityType: 'language',
        frequency: 10,
    });

    // Edges: queries → results
    graph.addEdge('q:rust_async', 'r:url1', { relation: 'yields', weight: 1 });
    graph.addEdge('q:rust_async', 'r:url2', { relation: 'yields', weight: 0.5 });
    graph.addEdge('q:tokio_runtime', 'r:url2', { relation: 'yields', weight: 1 });
    graph.addEdge('q:tokio_runtime', 'r:url3', { relation: 'yields', weight: 0.5 });

    // Edges: results → entities (builds degree)
    graph.addEdge('r:url1', 'e:tokio', { relation: 'mentions', weight: 1 });
    graph.addEdge('r:url1', 'e:rust', { relation: 'mentions', weight: 1 });
    graph.addEdge('r:url2', 'e:tokio', { relation: 'mentions', weight: 1 });
    graph.addEdge('r:url2', 'e:async_std', { relation: 'mentions', weight: 1 });
    graph.addEdge('r:url3', 'e:async_std', { relation: 'mentions', weight: 1 });

    return graph;
}

describe('query-suggest', () => {
    describe('generateQuerySuggestions', () => {
        it('returns top entities sorted by degree × frequency descending', () => {
            const graph = buildGraphWithEntitiesAndQueries();
            const results: SessionResult[] = [];

            const data = generateQuerySuggestions(graph, results, 'broad_exploration');

            expect(data.topEntities.length).toBe(3);
            // tokio: degree 2, frequency 8 → 16
            // async-std: degree 2, frequency 5 → 10
            // rust: degree 1, frequency 10 → 10
            // tokio should be first (16 > 10)
            expect(data.topEntities[0].label).toBe('tokio');
        });

        it('includes obfuscatedLabel when present', () => {
            const graph = buildGraphWithEntitiesAndQueries();
            const data = generateQuerySuggestions(graph, [], 'broad_exploration');

            const tokio = data.topEntities.find(e => e.label === 'tokio');
            expect(tokio?.obfuscatedLabel).toBe('a popular async runtime for a systems language');

            const rust = data.topEntities.find(e => e.label === 'rust');
            expect(rust?.obfuscatedLabel).toBeUndefined();
        });

        it('detects unexplored domains not in session results', () => {
            const graph = buildGraphWithEntitiesAndQueries();
            // Session results include a.com, b.com, c.com
            const results: SessionResult[] = [
                { url: 'https://a.com/1', title: 'A' },
                { url: 'https://b.com/2', title: 'B' },
            ];

            const data = generateQuerySuggestions(graph, results, 'broad_exploration');

            // arxiv.org, github.com, etc. should be in unexplored
            expect(data.unexploredDomains).toContain('arxiv.org');
            expect(data.unexploredDomains).toContain('github.com');
            // a.com, b.com should NOT be in unexplored
            expect(data.unexploredDomains).not.toContain('a.com');
        });

        it('returns all specialized domains as unexplored when no results', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            const data = generateQuerySuggestions(graph, [], 'broad_exploration');

            expect(data.unexploredDomains.length).toBeGreaterThan(0);
            expect(data.unexploredDomains).toContain('arxiv.org');
        });

        it('builds round history from query nodes', () => {
            const graph = buildGraphWithEntitiesAndQueries();
            const data = generateQuerySuggestions(graph, [], 'broad_exploration');

            expect(data.roundHistory.length).toBe(2);
            expect(data.roundHistory[0].query).toBe('rust async');
            expect(data.roundHistory[0].round).toBe(1);
            expect(data.roundHistory[0].resultCount).toBe(2); // url1, url2
            expect(data.roundHistory[1].query).toBe('tokio runtime');
            expect(data.roundHistory[1].round).toBe(2);
        });

        it('includes current stage', () => {
            const graph = buildGraphWithEntitiesAndQueries();
            const data = generateQuerySuggestions(graph, [], 'targeted_deep_dive');

            expect(data.currentStage).toBe('targeted_deep_dive');
        });

        it('carries no quality judgement', () => {
            const graph = buildGraphWithEntitiesAndQueries();

            const data = generateQuerySuggestions(graph, [], 'broad_exploration');

            expect(data).not.toHaveProperty('qualityLastRound');
        });

        it('handles empty graph gracefully', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            const data = generateQuerySuggestions(graph, [], 'broad_exploration');

            expect(data.topEntities).toEqual([]);
            expect(data.roundHistory).toEqual([]);
            expect(data.currentStage).toBe('broad_exploration');
        });
    });
});
