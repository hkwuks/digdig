/**
 * Performance benchmarks for Phase 12.
 *
 * Run: npx vitest run test/benchmark/performance.bench.ts
 *
 * Targets:
 *   TF-IDF          <100ms / 100 results
 *   Graph sampling  <100ms / <1000 nodes
 *   Jaccard         <1ms   / query pair
 *   Quality assess  <50ms  / 500 results
 *   Graph explore   <100ms / <1000 nodes
 *   getEntityDegree <5ms   / node
 */

import { describe, it, expect, vi } from 'vitest';
import { DirectedGraph } from 'graphology';
import { tokenize } from '../../src/deep/tfidf.js';
import { getEntityDegree } from '../../src/deep/degree-utils.js';
import { sampleGraph } from '../../src/deep/graph-sampling.js';
import { checkQueryRedundancy } from '../../src/deep/query-redundancy.js';
import {
    exploreSeedEntity,
    drillByRelations,
    detectDeadEnd,
    searchEntities,
} from '../../src/deep/graph-explore.js';
import { createGraph, entityId, GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { SessionResult } from '../../src/deep/session.js';

// ── Helpers ───────────────────────────────────────────────────────

function buildLargeGraph(nodeCount: number, edgeDensity: number): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = createGraph();
    for (let i = 0; i < nodeCount; i++) {
        const type = i % 3 === 0 ? 'entity' : i % 3 === 1 ? 'result' : 'query';
        const attrs: GraphNodeAttrs = {
            type,
            label: `node_${i}`,
            ...(type === 'entity' ? { entityType: 'concept', score: Math.random(), frequency: 1 } : {}),
            ...(type === 'result' ? { url: `https://example.com/${i}`, title: `Result ${i}` } : {}),
            ...(type === 'query' ? { query: `query ${i}`, round: 1 } : {}),
        };
        graph.mergeNode(`n:${i}`, attrs);
    }

    const edgeCount = Math.floor(nodeCount * edgeDensity);
    for (let i = 0; i < edgeCount; i++) {
        const from = Math.floor(Math.random() * nodeCount);
        const to = Math.floor(Math.random() * nodeCount);
        if (from !== to && !graph.hasEdge(`n:${from}`, `n:${to}`)) {
            graph.addEdge(`n:${from}`, `n:${to}`, {
                relation: ['depends_on', 'co_occurs_with', 'alternative_to', 'mentions'][Math.floor(Math.random() * 4)],
                weight: Math.random(),
            });
        }
    }
    return graph;
}

function buildResults(count: number): SessionResult[] {
    const results: SessionResult[] = [];
    for (let i = 0; i < count; i++) {
        results.push({
            url: `https://example.com/${i}`,
            title: `Result ${i} title`,
            content: `This is the content of result ${i}. It contains some text about technology and programming. `.repeat(10),
            engine: 'google',
            category: 'general',
            score: Math.random() * 100,
        });
    }
    return results;
}

function median(values: number[]): number {
    return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

function measure<T>(run: () => T): { result: T; elapsed: number } {
    let result = run();
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
        const start = performance.now();
        result = run();
        samples.push(performance.now() - start);
    }
    return { result, elapsed: median(samples) };
}

// ── Benchmarks ──────────────────────────────────────────────────────

describe('Performance Benchmarks', () => {
    it('ignores a single scheduling spike but rejects sustained slowdown', () => {
        const clock = vi.spyOn(performance, 'now');
        const run = vi.fn(() => 'result');
        try {
            for (const time of [0, 1, 1, 2, 2, 42, 42, 43, 43, 44]) clock.mockReturnValueOnce(time);
            expect(measure(run)).toEqual({ result: 'result', elapsed: 1 });
            expect(run).toHaveBeenCalledTimes(6);
            for (const time of [0, 6, 6, 12, 12, 18, 18, 24, 24, 30]) clock.mockReturnValueOnce(time);
            expect(measure(run).elapsed).toBeGreaterThanOrEqual(5);
        } finally {
            clock.mockRestore();
        }
    });
    describe('getEntityDegree', () => {
        it('computes degree for a node in <5ms', () => {
            const graph = buildLargeGraph(1000, 2);
            const entityNode = 'n:0'; // First node is entity

            const { result: degree, elapsed } = measure(() => getEntityDegree(graph, entityNode));

            expect(degree).toBeGreaterThanOrEqual(0);
            expect(elapsed).toBeLessThan(5);
            console.log(`  getEntityDegree (1000 nodes): ${elapsed.toFixed(3)}ms`);
        });
    });

    describe('Graph sampling', () => {
        it('samples a graph with <1000 nodes in <100ms', () => {
            const graph = buildLargeGraph(900, 1.5);
            const seedEntities: string[] = [];
            graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
                if (attrs.type === 'entity' && seedEntities.length < 2) {
                    seedEntities.push(node);
                }
            });

            const { result, elapsed } = measure(() => sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: seedEntities.length > 0 ? seedEntities : ['n:0'],
                maxHops: 5,
            }));

            expect(result.entities.length).toBeGreaterThanOrEqual(0);
            expect(elapsed).toBeLessThan(100);
            console.log(`  Graph sampling (900 nodes): ${elapsed.toFixed(2)}ms, entities=${result.entities.length}`);
        });
    });

    describe('Jaccard computation', () => {
        it('computes Jaccard for a query pair in <5ms', () => {
            const history = Array.from({ length: 50 }, (_, i) => `query ${i} about rust async programming`);

            const { result, elapsed } = measure(() => checkQueryRedundancy('rust async tutorial', history, {
                jaccardThreshold: 0.7,
                action: 'warn',
            }));

            expect(result).toBeDefined();
            expect(elapsed).toBeLessThan(5);
            console.log(`  Jaccard (50 history queries): ${elapsed.toFixed(3)}ms`);
        });
    });

    describe('Graph explore', () => {
        it('explores a graph with <1000 nodes in <100ms', () => {
            const graph = buildLargeGraph(900, 1.5);
            // Ensure at least one entity node exists
            let seedLabel = 'node_0';
            graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
                if (attrs.type === 'entity' && attrs.label) {
                    seedLabel = attrs.label;
                }
            });

            const { result, elapsed } = measure(() => exploreSeedEntity(graph, seedLabel));

            expect(result).toBeDefined();
            expect(elapsed).toBeLessThan(100);
            console.log(`  Graph explore (900 nodes): ${elapsed.toFixed(2)}ms`);
        });
    });
});
