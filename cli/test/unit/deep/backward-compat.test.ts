/**
 * Current session contract regression tests.
 *
 * Verifies:
 * - query-graph BFS behavior without --strategy
 * - Commander migration consistency
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadSessionGraph, initSessionDir, loadSessionResults } from '../../src/deep/session.js';
import { deserializeGraph, serializeGraph, GraphNodeAttrs, GraphEdgeAttrs } from '../../src/deep/graph.js';
import { DirectedGraph } from 'graphology';

describe('backward compatibility', () => {
    let sessionDir: string;

    beforeEach(() => {
        sessionDir = mkdtempSync(join(tmpdir(), 'sxng-compat-'));
    });

    afterEach(() => {
        rmSync(sessionDir, { recursive: true, force: true });
    });

    describe('current session contract', () => {
        it('round-trips a graph with optional entity fields omitted', () => {
            const oldGraph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            oldGraph.mergeNode('e:tokio', { type: 'entity', label: 'tokio' });
            oldGraph.mergeNode('e:rust', { type: 'entity', label: 'rust' });
            oldGraph.addEdge('e:tokio', 'e:rust', { relation: 'co_occurs_with', weight: 0.9 });

            const serialized = serializeGraph(oldGraph);
            writeFileSync(
                join(sessionDir, 'graph.json'),
                JSON.stringify({ status: 'ok', data: { graph: serialized } }, null, 2)
            );

            const graph = loadSessionGraph(sessionDir);
            expect(graph.hasNode('e:tokio')).toBe(true);
            expect(graph.hasNode('e:rust')).toBe(true);
            expect(graph.hasEdge('e:tokio', 'e:rust')).toBe(true);

            // Optional semantic fields remain absent when no Agent wrote them.
            const tokioAttrs = graph.getNodeAttributes('e:tokio');
            expect(tokioAttrs.score).toBeUndefined();
            expect(tokioAttrs.frequency).toBeUndefined();
        });

        it('rejects a result file that lacks the current envelope fields', () => {
            writeFileSync(
                join(sessionDir, 'results.json'),
                JSON.stringify({
                    status: 'ok',
                    data: {
                        results: [
                            { url: 'https://a.com', title: 'A', engine: 'google' },
                        ],
                    },
                }, null, 2)
            );

            expect(() => loadSessionResults(sessionDir)).toThrow('Invalid legacy session results.json');
        });
    });

    describe('graph-add backward compatibility', () => {
        it('adds entities without optional fields', () => {
            // Old-format entity (no entityType, score, etc.)
            const graph = new DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
            graph.mergeNode('e:legacy', { type: 'entity', label: 'legacy' });

            const serialized = serializeGraph(graph);
            writeFileSync(
                join(sessionDir, 'graph.json'),
                JSON.stringify({ status: 'ok', data: { graph: serialized } }, null, 2)
            );

            const loaded = loadSessionGraph(sessionDir);
            const attrs = loaded.getNodeAttributes('e:legacy');
            expect(attrs.type).toBe('entity');
            expect(attrs.label).toBe('legacy');
            expect(attrs.entityType).toBeUndefined();
            expect(attrs.score).toBeUndefined();
        });
    });

    describe('commander migration consistency', () => {
        it('createProgram is exported from runCli', async () => {
            const mod = await import('../../src/runCli.js');
            expect(mod.createProgram).toBeDefined();
            expect(typeof mod.createProgram).toBe('function');
        }, 20000);
    });
});
