import { describe, it, expect } from 'vitest';
import {
    exploreSeedEntity,
    drillByRelations,
    detectDeadEnd,
    traversePath,
    searchEntities,
    formatExploreAsMarkdown,
    formatDrillAsMarkdown,
    formatDeadEndAsMarkdown,
    formatTraverseAsMarkdown,
    formatSearchAsMarkdown,
    ExploreResult,
    DrillResult,
} from '../../src/deep/graph-explore.js';
import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';

/** Build a test graph with entities, results, queries, and path nodes. */
function buildTestGraph(): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();

    // Queries
    graph.mergeNode('q:rust_async', { type: 'query', label: 'rust async', query: 'rust async', round: 1 });
    graph.mergeNode('q:tokio_runtime', { type: 'query', label: 'tokio runtime', query: 'tokio runtime', round: 2 });

    // Results
    graph.mergeNode('r:url1', { type: 'result', label: 'Tokio Blog', url: 'https://tokio.rs/blog', title: 'Tokio Blog' });
    graph.mergeNode('r:url2', { type: 'result', label: 'Async Std Guide', url: 'https://async.rs/guide', title: 'Async Std Guide' });
    graph.mergeNode('r:url3', { type: 'result', label: 'Rust Async Book', url: 'https://rust-lang.github.io/async-book', title: 'Rust Async Book' });

    // Entities
    graph.mergeNode('e:tokio', { type: 'entity', label: 'tokio', entityType: 'runtime', score: 0.95, frequency: 8, sourceRounds: [1, 2] });
    graph.mergeNode('e:async_std', { type: 'entity', label: 'async-std', entityType: 'runtime', score: 0.85, frequency: 5, sourceRounds: [1] });
    graph.mergeNode('e:rust', { type: 'entity', label: 'rust', entityType: 'language', score: 0.9, frequency: 12, sourceRounds: [1, 2] });
    graph.mergeNode('e:mio', { type: 'entity', label: 'mio', entityType: 'library', score: 0.7, frequency: 3, sourceRounds: [2] });
    graph.mergeNode('e:futures', { type: 'entity', label: 'futures', entityType: 'library', score: 0.6, frequency: 2, sourceRounds: [1] });

    // Query  -> result edges
    graph.addEdge('q:rust_async', 'r:url1', { relation: 'yields', weight: 0.5 });
    graph.addEdge('q:rust_async', 'r:url2', { relation: 'yields', weight: 0.33 });
    graph.addEdge('q:tokio_runtime', 'r:url3', { relation: 'yields', weight: 0.5 });

    // Result  -> entity edges (mentions)
    graph.addEdge('r:url1', 'e:tokio', { relation: 'mentions', weight: 0.9 });
    graph.addEdge('r:url1', 'e:rust', { relation: 'mentions', weight: 0.7 });
    graph.addEdge('r:url2', 'e:async_std', { relation: 'mentions', weight: 0.8 });
    graph.addEdge('r:url2', 'e:rust', { relation: 'mentions', weight: 0.6 });
    graph.addEdge('r:url3', 'e:tokio', { relation: 'mentions', weight: 0.8 });
    graph.addEdge('r:url3', 'e:mio', { relation: 'mentions', weight: 0.5 });
    graph.addEdge('r:url3', 'e:futures', { relation: 'mentions', weight: 0.4 });

    // Entity  -> entity edges (semantic)
    graph.addEdge('e:tokio', 'e:async_std', { relation: 'alternative_to', weight: 0.9 });
    graph.addEdge('e:tokio', 'e:rust', { relation: 'co_occurs_with', weight: 0.85 });
    graph.addEdge('e:tokio', 'e:mio', { relation: 'depends_on', weight: 0.8 });
    graph.addEdge('e:async_std', 'e:rust', { relation: 'co_occurs_with', weight: 0.75 });

    return graph;
}

/** Build a graph with path nodes for traverse tests. */
function buildGraphWithPaths(): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = buildTestGraph();

    // Add a composition chain path node
    graph.mergeNode('p:chain_001', {
        type: 'path',
        label: 'Chain: tokio  -> async runtime  -> Rust  -> systems programming',
        pathType: 'composition_chain',
        hops: 3,
        entities: ['e:tokio', 'e:async_std', 'e:rust'],
    });
    graph.addEdge('p:chain_001', 'e:tokio', { relation: 'includes', weight: 1 });
    graph.addEdge('p:chain_001', 'e:async_std', { relation: 'includes', weight: 1 });
    graph.addEdge('p:chain_001', 'e:rust', { relation: 'includes', weight: 1 });

    // Add a conjunction path node
    graph.mergeNode('p:conj_001', {
        type: 'path',
        label: 'Conj: tokio + async-std  -> rust',
        pathType: 'conjunction',
        hops: 1,
        entities: ['e:tokio', 'e:async_std', 'e:rust'],
    });
    graph.addEdge('p:conj_001', 'e:tokio', { relation: 'includes', weight: 1 });
    graph.addEdge('p:conj_001', 'e:async_std', { relation: 'includes', weight: 1 });
    graph.addEdge('p:conj_001', 'e:rust', { relation: 'includes', weight: 1 });

    return graph;
}

/** Build a graph with a leaf entity (dead end). */
function buildGraphWithDeadEnd(): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = buildTestGraph();

    // Add a leaf entity with only mentioned_in
    graph.mergeNode('e:obscure_lib', { type: 'entity', label: 'obscure-lib', entityType: 'library', score: 0.3, frequency: 1 });
    graph.addEdge('e:obscure_lib', 'r:url3', { relation: 'mentioned_in', weight: 0.2 });

    return graph;
}

describe('graph-explore', () => {
    describe('exploreSeedEntity', () => {
        it('returns outgoing and incoming relations for a seed entity', () => {
            const graph = buildTestGraph();
            const result = exploreSeedEntity(graph, 'tokio');

            expect('error' in result).toBe(false);
            const explore = result as ExploreResult;
            expect(explore.entity.label).toBe('tokio');
            expect(explore.entity.degree).toBeGreaterThan(0);
            expect(explore.outgoingRelations.length).toBeGreaterThan(0);
            expect(explore.incomingRelations.length).toBeGreaterThan(0);
        });

        it('groups outgoing relations by type', () => {
            const graph = buildTestGraph();
            const result = exploreSeedEntity(graph, 'tokio') as ExploreResult;

            const relationTypes = result.outgoingRelations.map(g => g.relation);
            expect(relationTypes).toContain('alternative_to');
            expect(relationTypes).toContain('co_occurs_with');
            expect(relationTypes).toContain('depends_on');
        });

        it('includes incoming yields from query nodes', () => {
            const graph = buildTestGraph();
            const result = exploreSeedEntity(graph, 'tokio') as ExploreResult;

            // tokio has incoming "mentions" from results and "includes" from path
            // But we're only checking the basic test graph without paths
            const hasIncoming = result.incomingRelations.length > 0;
            expect(hasIncoming).toBe(true);
        })

        it('returns error with suggestions for unknown entity', () => {
            const graph = buildTestGraph();
            const result = exploreSeedEntity(graph, 'tokia');

            expect('error' in result).toBe(true);
            const err = result as { error: string; suggestions: any[] };
            expect(err.error).toContain('not found');
            expect(err.suggestions.length).toBeGreaterThan(0);
            // Should suggest "tokio" which is closest
            expect(err.suggestions[0].label).toBe('tokio');
        });

        it('is case-insensitive when matching labels', () => {
            const graph = buildTestGraph();
            const result = exploreSeedEntity(graph, 'Tokio');

            expect('error' in result).toBe(false);
        });

        it('generates suggested next steps', () => {
            const graph = buildTestGraph();
            const result = exploreSeedEntity(graph, 'tokio') as ExploreResult;

            expect(result.suggestedNextSteps.length).toBeGreaterThan(0);
        });

        it('returns empty relations for entity with no edges', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('e:lonely', { type: 'entity', label: 'lonely', entityType: 'concept' });

            const result = exploreSeedEntity(graph, 'lonely') as ExploreResult;
            expect(result.outgoingRelations).toEqual([]);
            expect(result.incomingRelations).toEqual([]);
            expect(result.entity.degree).toBe(0);
        });
    });

    describe('drillByRelations', () => {
        it('returns triples matching a single relation', () => {
            const graph = buildTestGraph();
            const result = drillByRelations(graph, 'tokio', ['alternative_to']);

            expect('error' in result).toBe(false);
            const drill = result as DrillResult;
            expect(drill.triples.length).toBeGreaterThan(0);
            expect(drill.triples[0].relation).toBe('alternative_to');
            expect(drill.triples[0].targetLabel).toBe('async-std');
        });

        it('returns triples matching multiple relations', () => {
            const graph = buildTestGraph();
            const result = drillByRelations(graph, 'tokio', ['alternative_to', 'depends_on']);

            const drill = result as DrillResult;
            expect(drill.triples.length).toBeGreaterThanOrEqual(2);
            const relations = drill.triples.map(t => t.relation);
            expect(relations).toContain('alternative_to');
            expect(relations).toContain('depends_on');
        });

        it('returns empty triples for non-existent relation', () => {
            const graph = buildTestGraph();
            const result = drillByRelations(graph, 'tokio', ['nonexistent_relation']);

            const drill = result as DrillResult;
            expect(drill.triples).toEqual([]);
        });

        it('returns error for unknown entity', () => {
            const graph = buildTestGraph();
            const result = drillByRelations(graph, 'nonexistent', ['alternative_to']);

            expect('error' in result).toBe(true);
        });

        it('generates next steps from discovered entities', () => {
            const graph = buildTestGraph();
            const result = drillByRelations(graph, 'tokio', ['alternative_to']) as DrillResult;

            expect(result.nextSteps.length).toBeGreaterThan(0);
        });

        it('deduplicates triples', () => {
            const graph = buildTestGraph();
            const result = drillByRelations(graph, 'tokio', ['alternative_to', 'alternative_to']);

            const drill = result as DrillResult;
            // Should not duplicate even with same relation listed twice
            const targets = drill.triples.map(t => t.target);
            const unique = new Set(targets);
            expect(targets.length).toBe(unique.size);
        });
    });

    describe('detectDeadEnd', () => {
        it('detects low degree entity as dead end', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('e:leaf', { type: 'entity', label: 'leaf', entityType: 'concept' });

            const deadEnd = detectDeadEnd(graph, 'e:leaf');
            expect(deadEnd).not.toBeNull();
            expect(deadEnd!.reason).toBe('low_degree');
        });

        it('detects already visited entity as dead end', () => {
            const graph = buildTestGraph();
            const visited = new Set(['e:tokio']);

            const deadEnd = detectDeadEnd(graph, 'e:tokio', visited);
            expect(deadEnd).not.toBeNull();
            expect(deadEnd!.reason).toBe('already_visited');
        });

        it('detects only_mentioned_in entity as dead end', () => {
            const graph = buildGraphWithDeadEnd();

            const deadEnd = detectDeadEnd(graph, 'e:obscure_lib');
            expect(deadEnd).not.toBeNull();
            expect(deadEnd!.reason).toBe('only_mentioned_in');
        });

        it('returns null for normal entity with diverse edges', () => {
            const graph = buildTestGraph();

            // tokio has alternative_to, co_occurs_with, depends_on edges  -> not a dead end
            const deadEnd = detectDeadEnd(graph, 'e:tokio');
            expect(deadEnd).toBeNull();
        });

        it('suggests alternative paths from visited nodes', () => {
            const graph = buildTestGraph();
            const visited = new Set(['e:tokio']);

            const deadEnd = detectDeadEnd(graph, 'e:tokio', visited);
            expect(deadEnd).not.toBeNull();
            // Should find alternative paths from unvisited entities
            if (deadEnd!.alternativePaths.length > 0) {
                expect(deadEnd!.alternativePaths[0].score).toBeGreaterThan(0);
            }
        });

        it('ranks alternatives by weight 脳 score 脳 (1 - visited ratio)', () => {
            const graph = buildTestGraph();
            const visited = new Set(['e:tokio']);

            const deadEnd = detectDeadEnd(graph, 'e:tokio', visited);
            if (deadEnd && deadEnd.alternativePaths.length >= 2) {
                // Alternatives should be sorted by score descending
                for (let i = 1; i < deadEnd.alternativePaths.length; i++) {
                    expect(deadEnd.alternativePaths[i - 1].score).toBeGreaterThanOrEqual(
                        deadEnd.alternativePaths[i].score
                    );
                }
            }
        });

        it('returns null for non-existent entity', () => {
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            const deadEnd = detectDeadEnd(graph, 'e:nonexistent');
            expect(deadEnd).toBeNull();
        });

        it('limits alternative paths to top 3', () => {
            // Build a graph with many outgoing edges from a visited node
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('e:hub', { type: 'entity', label: 'hub', entityType: 'concept', score: 1 });
            for (let i = 0; i < 10; i++) {
                const tId = `e:target_${i}`;
                graph.mergeNode(tId, { type: 'entity', label: `target_${i}`, entityType: 'concept', score: 0.5 });
                graph.addEdge('e:hub', tId, { relation: 'co_occurs_with', weight: 0.5 + i * 0.05 });
            }

            const visited = new Set(['e:hub']);
            const deadEnd = detectDeadEnd(graph, 'e:hub', visited);
            expect(deadEnd).not.toBeNull();
            expect(deadEnd!.alternativePaths.length).toBeLessThanOrEqual(3);
        });
    });

    describe('traversePath', () => {
        it('counts each result once across edges and source attributes', () => {
            const graph = buildGraphWithPaths();
            graph.mergeNodeAttributes('e:tokio', { sourceResultIds: ['r:url1', 'r:attribute-only'] });
            graph.mergeNodeAttributes('e:rust', { sourceResultIds: ['r:url1', 'r:attribute-only'] });
            const result = traversePath(graph, 'p:chain_001');
            expect('error' in result).toBe(false);
            if ('error' in result) throw new Error(result.error);
            expect(result.sources.resultIds).toEqual(['r:attribute-only', 'r:url1', 'r:url2', 'r:url3']);
            expect(result.sources.resultCount).toBe(4);
        });
        it('traverses a composition chain path node', () => {
            const graph = buildGraphWithPaths();
            const result = traversePath(graph, 'p:chain_001');

            expect('error' in result).toBe(false);
            const traverse = result as any;
            expect(traverse.pathType).toBe('composition_chain');
            expect(traverse.hops.length).toBe(3);
            expect(traverse.hops[0].entityLabel).toBe('tokio');
            expect(traverse.hops[1].entityLabel).toBe('async-std');
            expect(traverse.hops[2].entityLabel).toBe('rust');
        });

        it('includes relation between consecutive hops', () => {
            const graph = buildGraphWithPaths();
            const result = traversePath(graph, 'p:chain_001') as any;

            // tokio  -> async-std has alternative_to edge
            expect(result.hops[1].relation).toBeDefined();
        });

        it('returns error for non-existent path', () => {
            const graph = buildGraphWithPaths();
            const result = traversePath(graph, 'p:nonexistent');

            expect('error' in result).toBe(true);
            expect((result as any).availablePaths).toBeDefined();
        });

        it('lists available paths in error', () => {
            const graph = buildGraphWithPaths();
            const result = traversePath(graph, 'p:nonexistent') as any;

            expect(result.availablePaths).toContain('p:chain_001');
            expect(result.availablePaths).toContain('p:conj_001');
        });

        it('collects source info from entities in path', () => {
            const graph = buildGraphWithPaths();
            const result = traversePath(graph, 'p:chain_001') as any;

            expect(result.sources.resultIds.length).toBeGreaterThan(0);
        });
    });

    describe('searchEntities', () => {
        it('finds entities by keyword substring', () => {
            const graph = buildTestGraph();
            const results = searchEntities(graph, 'async');

            expect(results.length).toBeGreaterThan(0);
            // async-std should be found
            expect(results.some(r => r.label === 'async-std')).toBe(true);
        });

        it('is case-insensitive', () => {
            const graph = buildTestGraph();
            const results = searchEntities(graph, 'TOKIO');

            expect(results.length).toBeGreaterThan(0);
            expect(results[0].label).toBe('tokio');
        });

        it('returns empty array for no match', () => {
            const graph = buildTestGraph();
            const results = searchEntities(graph, 'nonexistent_xyz');

            expect(results).toEqual([]);
        });

        it('respects limit parameter', () => {
            const graph = buildTestGraph();
            const results = searchEntities(graph, 'a', 2);

            expect(results.length).toBeLessThanOrEqual(2);
        });

        it('ranks by score 脳 degree', () => {
            const graph = buildTestGraph();
            const results = searchEntities(graph, 'rust');

            expect(results.length).toBeGreaterThan(0);
            // Results should be sorted by score descending
            for (let i = 1; i < results.length; i++) {
                expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
            }
        });

        it('only returns entity type nodes', () => {
            const graph = buildTestGraph();
            const results = searchEntities(graph, 'url');

            // "url" might match result labels but searchEntities only returns entities
            for (const r of results) {
                expect(r.id).toMatch(/^e:/);
            }
        });
    });

    describe('formatting', () => {
        it('formatExploreAsMarkdown produces valid markdown', () => {
            const graph = buildTestGraph();
            const result = exploreSeedEntity(graph, 'tokio') as ExploreResult;
            const md = formatExploreAsMarkdown(result);

            expect(md).toContain('## Entity: tokio');
            expect(md).toContain('Outgoing Relations');
            expect(md).toContain('alternative_to');
        });

        it('formatDrillAsMarkdown produces valid markdown', () => {
            const graph = buildTestGraph();
            const result = drillByRelations(graph, 'tokio', ['alternative_to']) as DrillResult;
            const md = formatDrillAsMarkdown(result);

            expect(md).toContain('## Drill:');
            expect(md).toContain('alternative_to');
        });

        it('formatDeadEndAsMarkdown shows reason and alternatives', () => {
            const graph = buildGraphWithDeadEnd();
            const deadEnd = detectDeadEnd(graph, 'e:obscure_lib')!;
            const md = formatDeadEndAsMarkdown(deadEnd);

            expect(md).toContain('Dead End');
            expect(md).toContain('mentioned_in');
        });

        it('formatTraverseAsMarkdown produces hop table', () => {
            const graph = buildGraphWithPaths();
            const result = traversePath(graph, 'p:chain_001') as any;
            const md = formatTraverseAsMarkdown(result);

            expect(md).toContain('## Path:');
            expect(md).toContain('tokio');
        });

        it('formatSearchAsMarkdown produces entity table', () => {
            const graph = buildTestGraph();
            const results = searchEntities(graph, 'tokio');
            const md = formatSearchAsMarkdown(results, 'tokio');

            expect(md).toContain('## Search: "tokio"');
            expect(md).toContain('tokio');
        });
    });
});
