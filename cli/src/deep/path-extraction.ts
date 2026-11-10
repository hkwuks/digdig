/**
 * Reasoning path extraction from knowledge graphs.
 *
 * Detects structured reasoning patterns:
 * - composition_chain: e₁→(r₁)→e₂→(r₂)→e₃→... (sequential chain)
 * - conjunction: e₁→e₃←e₂ (two seeds converging on a shared target)
 *
 * Creates path: nodes in the graph with ordered entity IDs.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs, nextPathId, PathType } from './graph.js';
import { getEntityDegree } from './degree-utils.js';

// ── Types ─────────────────────────────────────────────────────────

export interface CompositionChain {
    id: string; // path node ID (p:chain_NNN)
    entities: string[]; // ordered entity IDs
    hops: number;
    relations: string[]; // edge relations along the chain
}

export interface ConjunctionPath {
    id: string; // path node ID (p:conj_NNN)
    seed1: string;
    seed2: string;
    bridge: string; // shared target entity
    hops: number; // max dist from either seed to bridge
}

export interface PathExtractionResult {
    compositionChains: CompositionChain[];
    conjunctions: ConjunctionPath[];
    totalPaths: number;
    truncated: boolean;
}

interface SearchBudget { steps: number; paths: number; truncated: boolean }

function consumeStep(budget?: SearchBudget): boolean {
    if (!budget) return true;
    if (budget.steps <= 0) { budget.truncated = true; return false; }
    budget.steps--;
    return true;
}

function consumePath(budget?: SearchBudget): boolean {
    if (!budget) return true;
    if (budget.paths <= 0) { budget.truncated = true; return false; }
    budget.paths--;
    return true;
}

export interface PathExtractionConfig {
    /** Min chain length (hops). Default: 2 */
    minChainHops?: number;
    /** Max chain length (hops). Default: 5 */
    maxChainHops?: number;
    /** Max BFS depth for conjunction search. Default: 3 */
    maxConjunctionDepth?: number;
    /** Deduplicate paths that share the same entity set. Default: true */
    dedup?: boolean;
}

// ── Composition Chain Detection ───────────────────────────────────

/**
 * Detect composition chains: sequences of entity→entity edges forming a path.
 * Walks the graph from each entity, following entity→entity edges up to maxHops.
 * Avoids revisiting nodes (cycle detection).
 */
export function detectCompositionChains(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: PathExtractionConfig,
    budget?: SearchBudget
): CompositionChain[] {
    const minHops = config?.minChainHops ?? 2;
    const maxHops = config?.maxChainHops ?? 5;
    const dedup = config?.dedup ?? true;

    const chains: CompositionChain[] = [];
    const seenEntitySets = new Set<string>();
    const firstId = nextPathId(graph, 'composition_chain');

    // Get all entity nodes
    const entityNodes: string[] = [];
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') entityNodes.push(node);
    });

    // Sort by degree descending — start from high-degree hubs
    entityNodes.sort((a, b) => getEntityDegree(graph, b) - getEntityDegree(graph, a));

    for (const startNode of entityNodes) {
        // DFS from startNode, following entity-to-entity edges
        const paths = dfsEntityChains(graph, startNode, maxHops, budget);

        for (const path of paths) {
            if (path.entities.length - 1 < minHops) continue;

            if (dedup) {
                const key = path.entities.join('|');
                const reverseKey = [...path.entities].reverse().join('|');
                if (seenEntitySets.has(key) || seenEntitySets.has(reverseKey)) continue;
                seenEntitySets.add(key);
            }

            if (!consumePath(budget)) return chains;

            const id = firstId.replace(/\d+$/, value => String(Number(value) + chains.length).padStart(3, '0'));
            chains.push({
                id,
                entities: path.entities,
                hops: path.entities.length - 1,
                relations: path.relations,
            });
        }
        if (budget?.truncated) break;
    }

    return chains;
}

interface EntityChainPath {
    entities: string[];
    relations: string[];
}

/** DFS from a start entity, collecting all chains up to maxHops. */
function dfsEntityChains(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    start: string,
    maxHops: number,
    budget?: SearchBudget
): EntityChainPath[] {
    const results: EntityChainPath[] = [];

    function dfs(current: string, path: string[], relations: string[], visited: Set<string>) {
        if (!consumeStep(budget)) return;
        if (path.length - 1 >= maxHops) {
            if (path.length - 1 >= 2) {
                results.push({ entities: [...path], relations: [...relations] });
            }
            return;
        }

        // Follow outgoing entity→entity edges
        const outEdges = graph.outEdges(current);
        let extended = false;
        for (const edge of outEdges) {
            if (!consumeStep(budget)) return;
            const target = graph.target(edge);
            if (visited.has(target)) continue;
            if (graph.getNodeAttributes(target).type !== 'entity') continue;

            const attrs = graph.getEdgeAttributes(edge);
            visited.add(target);
            path.push(target);
            relations.push(attrs.relation);

            dfs(target, path, relations, visited);
            extended = true;

            path.pop();
            relations.pop();
            visited.delete(target);
        }

        // Also follow incoming entity→entity edges
        const inEdges = graph.inEdges(current);
        for (const edge of inEdges) {
            if (!consumeStep(budget)) return;
            const source = graph.source(edge);
            if (visited.has(source)) continue;
            if (graph.getNodeAttributes(source).type !== 'entity') continue;

            const attrs = graph.getEdgeAttributes(edge);
            visited.add(source);
            path.push(source);
            relations.push(attrs.relation);

            dfs(source, path, relations, visited);
            extended = true;

            path.pop();
            relations.pop();
            visited.delete(source);
        }

        // Record this path if it's long enough (even if not at maxHops)
        if (!extended && path.length - 1 >= 2) {
            results.push({ entities: [...path], relations: [...relations] });
        }
    }

    dfs(start, [start], [], new Set([start]));
    return results;
}

// ── Conjunction Detection ─────────────────────────────────────────

/**
 * Detect conjunction patterns: e₁→e₃←e₂
 * Two entities that both have edges pointing to a shared target entity.
 */
export function detectConjunctions(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: PathExtractionConfig,
    budget?: SearchBudget
): ConjunctionPath[] {
    const maxDepth = config?.maxConjunctionDepth ?? 3;
    const dedup = config?.dedup ?? true;

    const conjunctions: ConjunctionPath[] = [];
    const seenPairs = new Set<string>();
    const firstId = nextPathId(graph, 'conjunction');

    // Get all entity nodes
    const entityNodes: string[] = [];
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') entityNodes.push(node);
    });

    // For each entity, find its targets within maxDepth
    const reachability = new Map<string, Map<string, number>>();
    for (const entity of entityNodes) {
        if (!consumeStep(budget)) return conjunctions;
        reachability.set(entity, bfsEntityReachable(graph, entity, maxDepth, budget));
        if (budget?.truncated) return conjunctions;
    }

    // Find pairs of entities that share a common target
    for (let i = 0; i < entityNodes.length; i++) {
        for (let j = i + 1; j < entityNodes.length; j++) {
            if (!consumeStep(budget)) return conjunctions;
            const e1 = entityNodes[i];
            const e2 = entityNodes[j];
            const reach1 = reachability.get(e1)!;
            const reach2 = reachability.get(e2)!;

            // Find common reachable entities
            for (const [target, d1] of reach1) {
                if (!consumeStep(budget)) return conjunctions;
                const d2 = reach2.get(target);
                if (d2 === undefined) continue;
                if (target === e1 || target === e2) continue;

                const pairKey = [e1, e2].sort().join('|') + '→' + target;
                if (dedup && seenPairs.has(pairKey)) continue;
                seenPairs.add(pairKey);

                if (!consumePath(budget)) return conjunctions;

                const id = firstId.replace(/\d+$/, value => String(Number(value) + conjunctions.length).padStart(3, '0'));
                conjunctions.push({
                    id,
                    seed1: e1,
                    seed2: e2,
                    bridge: target,
                    hops: Math.max(d1, d2),
                });
            }
        }
    }

    return conjunctions;
}

/** BFS from an entity, returning reachable entity nodes within maxDepth. */
function bfsEntityReachable(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    start: string,
    maxDepth: number,
    budget?: SearchBudget
): Map<string, number> {
    const dist = new Map<string, number>();
    const queue: Array<{ id: string; d: number }> = [{ id: start, d: 0 }];
    dist.set(start, 0);

    while (queue.length > 0) {
        if (!consumeStep(budget)) break;
        const { id, d } = queue.shift()!;
        if (d >= maxDepth) continue;

        // Follow both directions
        for (const neighbor of graph.neighbors(id)) {
            if (!consumeStep(budget)) return dist;
            if (dist.has(neighbor)) continue;
            if (graph.getNodeAttributes(neighbor).type !== 'entity') continue;
            dist.set(neighbor, d + 1);
            queue.push({ id: neighbor, d: d + 1 });
        }
    }

    dist.delete(start); // don't include self
    return dist;
}

// ── Combined extraction ───────────────────────────────────────────

/** Extract all reasoning paths from a graph. Creates path: nodes. */
export function extractPaths(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    config?: PathExtractionConfig
): PathExtractionResult {
    // shortcut: bounded extraction may omit paths in dense graphs; increase only with measured capacity.
    const budget: SearchBudget = { steps: 20_000, paths: 1_000, truncated: false };
    const chains = detectCompositionChains(graph, config, budget);
    const conjunctions = budget.truncated ? [] : detectConjunctions(graph, config, budget);
    const existing = new Map<string, string>();
    graph.forEachNode((id, attrs) => {
        if (attrs.type === 'path' && attrs.pathType && attrs.entities) {
            existing.set(JSON.stringify([attrs.pathType, attrs.entities]), id);
        }
    });

    // Create path: nodes in the graph
    for (const chain of chains) {
        chain.id = existing.get(JSON.stringify(['composition_chain', chain.entities])) ?? chain.id;
        graph.mergeNode(chain.id, {
            type: 'path',
            label: `Chain: ${chain.entities.map(e => graph.getNodeAttributes(e)?.label ?? e).join(' → ')}`,
            pathType: 'composition_chain',
            hops: chain.hops,
            entities: chain.entities,
        });
        // Add includes edges from path to each entity
        for (const entityId of chain.entities) {
            if (graph.hasNode(entityId) && !graph.hasEdge(chain.id, entityId)) {
                graph.addEdge(chain.id, entityId, { relation: 'includes', weight: 1 });
            }
        }
    }

    for (const conj of conjunctions) {
        conj.id = existing.get(JSON.stringify(['conjunction', [conj.seed1, conj.seed2, conj.bridge]])) ?? conj.id;
        const e1Label = graph.getNodeAttributes(conj.seed1)?.label ?? conj.seed1;
        const e2Label = graph.getNodeAttributes(conj.seed2)?.label ?? conj.seed2;
        const bridgeLabel = graph.getNodeAttributes(conj.bridge)?.label ?? conj.bridge;
        graph.mergeNode(conj.id, {
            type: 'path',
            label: `Conj: ${e1Label} + ${e2Label} → ${bridgeLabel}`,
            pathType: 'conjunction',
            hops: conj.hops,
            entities: [conj.seed1, conj.seed2, conj.bridge],
        });
        for (const entityId of [conj.seed1, conj.seed2, conj.bridge]) {
            if (graph.hasNode(entityId) && !graph.hasEdge(conj.id, entityId)) {
                graph.addEdge(conj.id, entityId, { relation: 'includes', weight: 1 });
            }
        }
    }

    return {
        compositionChains: chains,
        conjunctions,
        totalPaths: chains.length + conjunctions.length,
        truncated: budget.truncated,
    };
}
