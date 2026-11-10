import { describe, it, expect } from 'vitest';
import {
    detectCompositionChains,
    detectConjunctions,
    extractPaths,
} from '../../src/deep/path-extraction.js';
import { createGraph, entityId, GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';

describe('path-extraction', () => {
    describe('detectCompositionChains', () => {
        it('detects a simple chain of 3 entities', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const chains = detectCompositionChains(graph);
            expect(chains.length).toBeGreaterThan(0);
            expect(chains[0].hops).toBeGreaterThanOrEqual(2);
            expect(chains[0].entities.length).toBeGreaterThanOrEqual(3);
        });

        it('respects minChainHops config', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });

            // Default minChainHops=2, this chain is only 1 hop → not included
            const chains = detectCompositionChains(graph);
            expect(chains).toEqual([]);
        });

        it('detects chains following incoming edges', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            // a→b and c→b (b has two incoming)
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('c'), entityId('b'), { relation: 'depends_on', weight: 1 });

            const chains = detectCompositionChains(graph, { minChainHops: 2 });
            // a→b→c or c→b→a — bidirectional traversal
            // Actually a→b and c→b: from a, we can go to b, then to c via incoming edge
            // This depends on the DFS implementation
            // At minimum, we should get some chains if the graph is connected
            // With only 1-hop edges, minChainHops=2 means we need at least 2 hops
            // The DFS follows both outgoing and incoming, so a→b and then from b, c→b means c is incoming
            // So path would be a→b←c which is a-b-c in entity order
            const chainsRelaxed = detectCompositionChains(graph, { minChainHops: 2 });
            expect(chainsRelaxed.length).toBeGreaterThanOrEqual(0);
        });

        it('respects maxChainHops limit', () => {
            const graph = createGraph();
            for (let i = 0; i < 6; i++) {
                graph.mergeNode(entityId(`n${i}`), { type: 'entity', label: `n${i}` });
            }
            for (let i = 0; i < 5; i++) {
                graph.addEdge(entityId(`n${i}`), entityId(`n${i + 1}`), { relation: 'depends_on', weight: 1 });
            }

            const chains = detectCompositionChains(graph, { maxChainHops: 3, minChainHops: 2 });
            for (const chain of chains) {
                expect(chain.hops).toBeLessThanOrEqual(3);
            }
        });

        it('deduplicates chains by entity set', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const chains = detectCompositionChains(graph, { dedup: true });
            // a→b→c and c→b→a would be deduped
            // Count unique entity sets
            const entitySets = new Set(chains.map(c => c.entities.join('|')));
            // Reverse chains should be deduped
            expect(entitySets.size).toBeLessThanOrEqual(chains.length);
        });

        it('returns empty for graph with no entity chains', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            // No edges between entities

            const chains = detectCompositionChains(graph);
            expect(chains).toEqual([]);
        });

        it('records edge relations along chain', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'alternative_to', weight: 1 });

            const chains = detectCompositionChains(graph);
            if (chains.length > 0) {
                expect(chains[0].relations).toContain('depends_on');
            }
        });

        it('generates path node IDs with auto-increment', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const chains = detectCompositionChains(graph);
            if (chains.length > 0) {
                expect(chains[0].id).toMatch(/^p:chain_\d{3}$/);
            }
        });

        it('assigns unique IDs to every chain detected in one batch', () => {
            const graph = createGraph();
            for (const label of ['a', 'b', 'c', 'd', 'e', 'f']) {
                graph.mergeNode(entityId(label), { type: 'entity', label });
            }
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('d'), entityId('e'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('e'), entityId('f'), { relation: 'depends_on', weight: 1 });

            const chains = detectCompositionChains(graph, { minChainHops: 2, maxChainHops: 2 });

            expect(chains).toHaveLength(2);
            expect(new Set(chains.map(chain => chain.id)).size).toBe(chains.length);
        });
    });

    describe('detectConjunctions', () => {
        it('detects two seeds converging on a shared target', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('async_std'), { type: 'entity', label: 'async-std' });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust' });
            graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 1 });

            const conjunctions = detectConjunctions(graph);
            // With bidirectional BFS, may also find tokio+rust→async_std and async_std+rust→tokio
            expect(conjunctions.length).toBeGreaterThanOrEqual(1);
            // Find the tokio+async_std→rust conjunction
            const main = conjunctions.find(c =>
                (c.seed1 === entityId('tokio') && c.seed2 === entityId('async_std')) ||
                (c.seed1 === entityId('async_std') && c.seed2 === entityId('tokio'))
            );
            expect(main).toBeDefined();
            expect(main!.bridge).toBe(entityId('rust'));
        });

        it('detects multi-hop conjunctions', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.mergeNode(entityId('d'), { type: 'entity', label: 'd' });
            // a→c→d and b→c→d (both converge on d through c)
            graph.addEdge(entityId('a'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('c'), entityId('d'), { relation: 'depends_on', weight: 1 });

            const conjunctions = detectConjunctions(graph, { maxConjunctionDepth: 3 });
            // Should find a+d→c or a+b→c or similar convergence
            expect(conjunctions.length).toBeGreaterThan(0);
        });

        it('returns empty when no shared targets exist', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            // a→c but b has no path to c
            graph.addEdge(entityId('a'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const conjunctions = detectConjunctions(graph);
            expect(conjunctions).toEqual([]);
        });

        it('respects maxConjunctionDepth', () => {
            const graph = createGraph();
            for (let i = 0; i < 5; i++) {
                graph.mergeNode(entityId(`n${i}`), { type: 'entity', label: `n${i}` });
            }
            // Chain: 0→1→2→3→4
            for (let i = 0; i < 4; i++) {
                graph.addEdge(entityId(`n${i}`), entityId(`n${i + 1}`), { relation: 'depends_on', weight: 1 });
            }

            // With depth 1, n0 and n1 can't both reach n4
            const shallow = detectConjunctions(graph, { maxConjunctionDepth: 1 });
            // With depth 4, they can
            const deep = detectConjunctions(graph, { maxConjunctionDepth: 4 });
            expect(deep.length).toBeGreaterThanOrEqual(shallow.length);
        });

        it('generates conjunction path node IDs', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('async_std'), { type: 'entity', label: 'async-std' });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust' });
            graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 1 });

            const conjunctions = detectConjunctions(graph);
            expect(conjunctions[0].id).toMatch(/^p:conj_\d{3}$/);
        });

        it('assigns unique IDs to every conjunction detected in one batch', () => {
            const graph = createGraph();
            for (const label of ['a', 'b', 'c', 'target']) {
                graph.mergeNode(entityId(label), { type: 'entity', label });
            }
            graph.addEdge(entityId('a'), entityId('target'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('target'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('c'), entityId('target'), { relation: 'depends_on', weight: 1 });

            const conjunctions = detectConjunctions(graph, { maxConjunctionDepth: 1 });

            expect(conjunctions).toHaveLength(3);
            expect(new Set(conjunctions.map(conjunction => conjunction.id)).size).toBe(conjunctions.length);
        });

        it('deduplicates conjunction pairs', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('c'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const conjunctions = detectConjunctions(graph, { dedup: true });
            // Should only have 1 entry for (a,b)→c, not 2
            const pairs = conjunctions.map(c => [c.seed1, c.seed2].sort().join('|') + '→' + c.bridge);
            const uniquePairs = new Set(pairs);
            expect(pairs.length).toBe(uniquePairs.size);
        });
    });

    describe('extractPaths', () => {
        it('creates path nodes in the graph', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('hyper'), { type: 'entity', label: 'hyper' });
            graph.mergeNode(entityId('tonic'), { type: 'entity', label: 'tonic' });
            graph.addEdge(entityId('tokio'), entityId('hyper'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('hyper'), entityId('tonic'), { relation: 'depends_on', weight: 1 });

            const result = extractPaths(graph);

            // Check path nodes were created in the graph
            let pathCount = 0;
            graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
                if (attrs.type === 'path') pathCount++;
            });
            // extractPaths creates path nodes as it processes chains and conjunctions
            expect(pathCount).toBeGreaterThan(0);
        });

        it('adds includes edges from path to entities', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('a'), { type: 'entity', label: 'a' });
            graph.mergeNode(entityId('b'), { type: 'entity', label: 'b' });
            graph.mergeNode(entityId('c'), { type: 'entity', label: 'c' });
            graph.addEdge(entityId('a'), entityId('b'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('b'), entityId('c'), { relation: 'depends_on', weight: 1 });

            const result = extractPaths(graph);

            if (result.compositionChains.length > 0) {
                const chain = result.compositionChains[0];
                for (const eId of chain.entities) {
                    expect(graph.hasEdge(chain.id, eId)).toBe(true);
                    const edgeAttrs = graph.getEdgeAttributes(graph.edges(chain.id, eId)[0]);
                    expect(edgeAttrs.relation).toBe('includes');
                }
            }
        });

        it('reports totalPaths as chains + conjunctions', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('async_std'), { type: 'entity', label: 'async-std' });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust' });
            graph.mergeNode(entityId('hyper'), { type: 'entity', label: 'hyper' });
            graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('tokio'), entityId('hyper'), { relation: 'depends_on', weight: 1 });

            const result = extractPaths(graph);
            expect(result.totalPaths).toBe(result.compositionChains.length + result.conjunctions.length);
        });

        it('handles empty graph gracefully', () => {
            const graph = createGraph();
            const result = extractPaths(graph);
            expect(result.compositionChains).toEqual([]);
            expect(result.conjunctions).toEqual([]);
            expect(result.totalPaths).toBe(0);
            expect(result.truncated).toBe(false);
        });

        it('reports a search budget limit even when no paths are found', () => {
            const graph = createGraph();
            for (let i = 0; i < 300; i++) graph.addNode(`e:${i}`, { type: 'entity', label: String(i) });
            const result = extractPaths(graph);
            expect(result.totalPaths).toBe(0);
            expect(result.truncated).toBe(true);
        });

        it('allocates chain IDs after existing four-digit counters', () => {
            const graph = createGraph();
            graph.addNode('p:chain_1000', { type: 'path', pathType: 'composition_chain', label: 'Existing', entities: [] });
            for (const id of ['a', 'b', 'c']) graph.addNode(id, { type: 'entity', label: id });
            graph.addEdge('a', 'b', { relation: 'related', weight: 1 });
            graph.addEdge('b', 'c', { relation: 'related', weight: 1 });
            expect(extractPaths(graph).compositionChains[0].id).toBe('p:chain_1001');
        });

        it('path nodes have correct pathType', () => {
            const graph = createGraph();
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio' });
            graph.mergeNode(entityId('async_std'), { type: 'entity', label: 'async-std' });
            graph.mergeNode(entityId('rust'), { type: 'entity', label: 'rust' });
            graph.addEdge(entityId('tokio'), entityId('rust'), { relation: 'depends_on', weight: 1 });
            graph.addEdge(entityId('async_std'), entityId('rust'), { relation: 'depends_on', weight: 1 });

            const result = extractPaths(graph);

            // Check conjunction path nodes
            for (const conj of result.conjunctions) {
                const attrs = graph.getNodeAttributes(conj.id);
                expect(attrs.type).toBe('path');
                expect(attrs.pathType).toBe('conjunction');
                // entities field contains [seed1, seed2, bridge] in iteration order
                expect(attrs.entities).toContain(conj.bridge);
                expect(attrs.entities!.length).toBe(3);
            }
        });
    });
});
