/**
 * Entity-centric knowledge graph using graphology
 *
 * The graph stores entities and their relationships.
 * Search results are stored as lightweight metadata nodes (title, url, rank)
 * connected to entities via "mentions" edges.
 *
 * Entity extraction is done by the Agent (LLM), not by the CLI.
 * The CLI only stores what the Agent sends via graph-add.
 */

import { DirectedGraph, MultiDirectedGraph } from 'graphology';
import { createHash } from 'crypto';
import { resultUrlKey } from './dedupe.js';

/** Semantic edge relation types */
export const EDGE_RELATIONS = {
    yields: 'yields',           // query → result
    belongs_to: 'belongs_to',   // result → domain
    mentions: 'mentions',       // result → entity
    alternative_to: 'alternative_to', // entity ↔ entity
    depends_on: 'depends_on',   // entity → entity
    co_occurs_with: 'co_occurs_with', // entity ↔ entity
    mentioned_in: 'mentioned_in',     // entity → result
    includes: 'includes',             // path → entity
} as const;

export type PathType = 'composition_chain' | 'conjunction' | 'augmented_chain' | 'community_core_path' | 'dual_core_bridge';

export interface GraphNodeAttrs {
    type: 'entity' | 'result' | 'query' | 'domain' | 'path';
    label: string;
    // Entity-specific
    entityType?: string; // e.g. "person", "technology", "concept"
    score?: number;
    reasoningPaths?: string[]; // path node IDs this entity participates in
    sourceResultIds?: string[]; // approved extracted results that support this semantic node
    frequency?: number; // how many results mention this entity
    obfuscatedLabel?: string; // LLM-generated obfuscated label (Phase 5)
    // Result-specific
    url?: string;
    rank?: number;
    title?: string;
    source?: string; // "digdig" | "tavily" | "exa" | "open-web-search" | ... — which tool produced this result
    origins?: Array<{ tool: string; engine?: string; query: string; round?: number }>;
    // Query-specific
    query?: string;
    round?: number;
    // Domain-specific
    domain?: string;
    // Path-specific
    pathType?: PathType;
    hops?: number;
    entities?: string[]; // ordered entity IDs in this path
}

export interface GraphEdgeAttrs {
    relation: string;
    weight: number;
    sourceResultIds?: string[];
}

function generateId(prefix: string, value: string): string {
    const normalized = value.toLowerCase();
    const readable = normalized.replace(/[^\w]+/g, '_').replace(/^_+|_+$/g, '') || 'node';
    const hash = createHash('sha256').update(normalized).digest('hex').slice(0, 16);
    return `${prefix}:${readable.slice(0, 41)}_${hash}`;
}

/** Create an empty entity-centric knowledge graph */
export function createGraph(): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    return new MultiDirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
}

/** Generate a node ID for an entity */
export function entityId(label: string): string {
    return generateId('e', label);
}

/** Generate a node ID for a result */
export function resultId(url: string): string {
    return generateId('r', resultUrlKey({ url }));
}

/** Generate a node ID for a query */
export function queryId(query: string, round?: number): string {
    return generateId('q', `${query}\0${round ?? 0}`);
}

/** Generate a node ID for a domain */
export function domainId(domain: string): string {
    return generateId('d', domain);
}

/** Map from PathType to ID prefix */
const PATH_TYPE_PREFIX: Record<PathType, string> = {
    composition_chain: 'chain',
    conjunction: 'conj',
    augmented_chain: 'aug',
    community_core_path: 'core',
    dual_core_bridge: 'bridge',
};

/** Generate the next path node ID for a given path type.
 *  Scans existing graph nodes to find the current max counter. */
export function nextPathId(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    pathType: PathType,
    batchOffset = 0,
): string {
    const prefix = PATH_TYPE_PREFIX[pathType];
    let maxCounter = 0;
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'path' && attrs.pathType === pathType) {
            // Extract counter from node ID: p:<prefix>_NNN
            const match = node.match(new RegExp(`^p:${prefix}_(\\d+)$`));
            if (match) {
                const counter = parseInt(match[1], 10);
                if (counter > maxCounter) maxCounter = counter;
            }
        }
    });
    const next = maxCounter + batchOffset + 1;
    return `p:${prefix}_${String(next).padStart(3, '0')}`;
}

/** Extract domain from URL */
function extractDomain(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/** Auto-build structural edges: query→result→domain */
export function buildStructuralEdges(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    query: string,
    results: Array<{ url: string; title: string; rank?: number; origins?: GraphNodeAttrs['origins'] }>,
    round?: number
): void {
    const qId = queryId(query, round);

    // Ensure query node exists
    if (!graph.hasNode(qId)) {
        graph.mergeNode(qId, {
            type: 'query',
            label: query,
            query,
            round,
        });
    }

    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const rId = resultId(r.url);

        // Ensure result node exists
        if (!graph.hasNode(rId)) {
            graph.mergeNode(rId, {
                type: 'result',
                label: r.title,
                url: r.url,
                title: r.title,
                rank: r.rank ?? i + 1,
                origins: r.origins ?? [],
            });
        }

        // query→result edge
        if (!graph.hasEdge(qId, rId)) {
            graph.addEdge(qId, rId, {
                relation: 'yields',
                weight: 1 / (i + 1),
            });
        }

        // domain node and result→domain edge
        const domain = extractDomain(r.url);
        if (domain) {
            const dId = domainId(domain);
            if (!graph.hasNode(dId)) {
                graph.mergeNode(dId, {
                    type: 'domain',
                    label: domain,
                    domain,
                });
            }
            if (!graph.hasEdge(rId, dId)) {
                graph.addEdge(rId, dId, {
                    relation: 'belongs_to',
                    weight: 1,
                });
            }
        }
    }
}

export function bfsSubgraph(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    seeds: string[],
    depth: number = 2
): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const visited = new Set<string>();
    const queue: Array<{ id: string; depth: number }> = seeds
        .filter(id => graph.hasNode(id))
        .map(id => ({ id, depth: 0 }));

    while (queue.length > 0) {
        const { id, depth: d } = queue.shift()!;
        if (d > depth || visited.has(id)) continue;

        visited.add(id);
        graph.forEachNeighbor(id, (neighbor: string) => {
            if (!visited.has(neighbor)) {
                queue.push({ id: neighbor, depth: d + 1 });
            }
        });
    }

    const subgraph = new MultiDirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    for (const nodeId of visited) {
        const attrs = graph.getNodeAttributes(nodeId);
        subgraph.mergeNode(nodeId, attrs);
    }

    graph.forEachEdge((edge: string, attrs: GraphEdgeAttrs, source: string, target: string) => {
        if (visited.has(source) && visited.has(target)) {
            subgraph.mergeEdge(source, target, attrs);
        }
    });

    return subgraph;
}

export function serializeGraph(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): object {
    return graph.export();
}

export function deserializeGraph(data: any): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> {
    const graph = new MultiDirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>();
    graph.import(data);
    return graph;
}

export function graphStats(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): {
    nodes: number;
    edges: number;
    entities: number;
    results: number;
    queries: number;
    domains: number;
    paths: number;
} {
    let entities = 0, results = 0, queries = 0, domains = 0, paths = 0;
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') entities++;
        else if (attrs.type === 'result') results++;
        else if (attrs.type === 'query') queries++;
        else if (attrs.type === 'domain') domains++;
        else if (attrs.type === 'path') paths++;
    });

    return {
        nodes: graph.order,
        edges: graph.size,
        entities,
        results,
        queries,
        domains,
        paths,
    };
}
