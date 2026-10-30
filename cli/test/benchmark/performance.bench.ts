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

import { describe, it, expect } from 'vitest';
import { DirectedGraph } from 'graphology';
import { tokenize, computeTfIdf } from '../../src/deep/tfidf.js';
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

// ── Benchmarks ──────────────────────────────────────────────────────

describe('Performance Benchmarks', () => {
    describe('TF-IDF', () => {
        it('computes TF-IDF for 100 results in <100ms', () => {
            const results = buildResults(100);
            const start = performance.now();
            const output = computeTfIdf(results, { top: 30 });
            const elapsed = performance.now() - start;

            expect(output.terms.length).toBeGreaterThan(0);
            expect(elapsed).toBeLessThan(100);
            console.log(`  TF-IDF (100 results): ${elapsed.toFixed(2)}ms, terms=${output.terms.length}`);
        });
    });

    describe('getEntityDegree', () => {
        it('computes degree for a node in <5ms', () => {
            const graph = buildLargeGraph(1000, 2);
            const entityNode = 'n:0'; // First node is entity

            const start = performance.now();
            const degree = getEntityDegree(graph, entityNode);
            const elapsed = performance.now() - start;

            expect(degree).toBeGreaterThanOrEqual(0);
            // A single wall-clock sample is susceptible to Windows scheduler jitter.
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

            const start = performance.now();
            const result = sampleGraph(graph, {
                strategy: 'augmented_chain',
                seedEntities: seedEntities.length > 0 ? seedEntities : ['n:0'],
                maxHops: 5,
            });
            const elapsed = performance.now() - start;

            expect(result.entities.length).toBeGreaterThanOrEqual(0);
            expect(elapsed).toBeLessThan(100);
            console.log(`  Graph sampling (900 nodes): ${elapsed.toFixed(2)}ms, entities=${result.entities.length}`);
        });
    });

    describe('Jaccard computation', () => {
        it('computes Jaccard for a query pair in <5ms', () => {
            const history = Array.from({ length: 50 }, (_, i) => `query ${i} about rust async programming`);

            const start = performance.now();
            const result = checkQueryRedundancy('rust async tutorial', history, {
                jaccardThreshold: 0.7,
                action: 'warn',
            });
            const elapsed = performance.now() - start;

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

            const start = performance.now();
            const result = exploreSeedEntity(graph, seedLabel);
            const elapsed = performance.now() - start;

            expect(result).toBeDefined();
            expect(elapsed).toBeLessThan(100);
            console.log(`  Graph explore (900 nodes): ${elapsed.toFixed(2)}ms`);
        });
    });
});
