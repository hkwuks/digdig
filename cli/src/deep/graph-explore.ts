/**
 * Agent-style knowledge graph exploration.
 *
 * Two-step interaction model:
 *   graph-explore: inspect all relations around a seed entity (summary view)
 *   graph-drill:   follow specific relations from an entity (targeted retrieval)
 *
 * Also includes dead-end detection and alternative path suggestion.
 */

import { DirectedGraph } from 'graphology';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';
import { getEntityDegree } from './degree-utils.js';
import { distance as levenshteinDistance } from 'fastest-levenshtein';

// ── Types ─────────────────────────────────────────────────────────

export interface RelationTarget {
    nodeId: string;
    label: string;
    type: string;
    weight: number;
}

export interface RelationGroup {
    relation: string;
    targets: RelationTarget[];
}

export interface ExploreResult {
    entity: {
        id: string;
        label: string;
        type: string;
        score?: number;
        degree: number;
    };
    outgoingRelations: RelationGroup[];
    incomingRelations: RelationGroup[];
    suggestedNextSteps: string[];
}

export interface DrillResult {
    seed: string;
    relations: string[];
    triples: Array<{
        source: string;
        sourceLabel: string;
        relation: string;
        target: string;
        targetLabel: string;
        weight: number;
    }>;
    nextSteps: string[];
}

export interface DeadEndInfo {
    entityId: string;
    reason: 'low_degree' | 'only_mentioned_in' | 'already_visited';
    alternativePaths: Array<{
        fromEntity: string;
        fromLabel: string;
        relation: string;
        toEntity: string;
        toLabel: string;
        score: number;
    }>;
}

export interface EntitySuggestion {
    id: string;
    label: string;
    distance: number;
}

// ── Explore ───────────────────────────────────────────────────────

/** Explore all relations around a seed entity. */
export function exploreSeedEntity(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    seedLabel: string,
): ExploreResult | { error: string; suggestions: EntitySuggestion[] } {
    const eId = findEntityByLabel(graph, seedLabel);

    if (!eId) {
        const suggestions = suggestSimilarEntities(graph, seedLabel);
        return {
            error: `Entity "${seedLabel}" not found`,
            suggestions,
        };
    }

    const attrs = graph.getNodeAttributes(eId);
    const degree = getEntityDegree(graph, eId);

    // Collect outgoing relations
    const outEdges = graph.outEdges(eId);
    const outByRelation = new Map<string, RelationTarget[]>();
    for (const edge of outEdges) {
        const target = graph.target(edge);
        const edgeAttrs = graph.getEdgeAttributes(edge);
        const targetAttrs = graph.getNodeAttributes(target);
        const group = outByRelation.get(edgeAttrs.relation) || [];
        group.push({
            nodeId: target,
            label: targetAttrs.label,
            type: targetAttrs.type,
            weight: edgeAttrs.weight,
        });
        outByRelation.set(edgeAttrs.relation, group);
    }

    // Collect incoming relations
    const inEdges = graph.inEdges(eId);
    const inByRelation = new Map<string, RelationTarget[]>();
    for (const edge of inEdges) {
        const source = graph.source(edge);
        const edgeAttrs = graph.getEdgeAttributes(edge);
        const sourceAttrs = graph.getNodeAttributes(source);
        const group = inByRelation.get(edgeAttrs.relation) || [];
        group.push({
            nodeId: source,
            label: sourceAttrs.label,
            type: sourceAttrs.type,
            weight: edgeAttrs.weight,
        });
        inByRelation.set(edgeAttrs.relation, group);
    }

    const outgoingRelations: RelationGroup[] = [...outByRelation.entries()]
        .map(([relation, targets]) => ({ relation, targets }))
        .sort((a, b) => b.targets.length - a.targets.length);

    const incomingRelations: RelationGroup[] = [...inByRelation.entries()]
        .map(([relation, targets]) => ({ relation, targets }))
        .sort((a, b) => b.targets.length - a.targets.length);

    // Generate suggested next steps
    const suggestedNextSteps = generateExploreNextSteps(
        eId, attrs.label, outgoingRelations, incomingRelations,
    );

    return {
        entity: {
            id: eId,
            label: attrs.label,
            type: attrs.entityType || attrs.type,
            score: attrs.score,
            degree,
        },
        outgoingRelations,
        incomingRelations,
        suggestedNextSteps,
    };
}

// ── Drill ─────────────────────────────────────────────────────────

/** Follow specific relations from a seed entity. */
export function drillByRelations(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    seedLabel: string,
    relations: string[],
): DrillResult | { error: string; suggestions: EntitySuggestion[] } {
    const eId = findEntityByLabel(graph, seedLabel);

    if (!eId) {
        const suggestions = suggestSimilarEntities(graph, seedLabel);
        return {
            error: `Entity "${seedLabel}" not found`,
            suggestions,
        };
    }

    const attrs = graph.getNodeAttributes(eId);
    const relationSet = new Set(relations);
    const triples: DrillResult['triples'] = [];
    const seen = new Set<string>();

    // Outgoing edges
    const outEdges = graph.outEdges(eId);
    for (const edge of outEdges) {
        const target = graph.target(edge);
        const edgeAttrs = graph.getEdgeAttributes(edge);
        if (!relationSet.has(edgeAttrs.relation)) continue;

        const targetAttrs = graph.getNodeAttributes(target);
        const key = `${eId}|${edgeAttrs.relation}|${target}`;
        if (seen.has(key)) continue;
        seen.add(key);

        triples.push({
            source: eId,
            sourceLabel: attrs.label,
            relation: edgeAttrs.relation,
            target,
            targetLabel: targetAttrs.label,
            weight: edgeAttrs.weight,
        });
    }

    // Incoming edges
    const inEdges = graph.inEdges(eId);
    for (const edge of inEdges) {
        const source = graph.source(edge);
        const edgeAttrs = graph.getEdgeAttributes(edge);
        if (!relationSet.has(edgeAttrs.relation)) continue;

        const sourceAttrs = graph.getNodeAttributes(source);
        const key = `${source}|${edgeAttrs.relation}|${eId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        triples.push({
            source,
            sourceLabel: sourceAttrs.label,
            relation: edgeAttrs.relation,
            target: eId,
            targetLabel: attrs.label,
            weight: edgeAttrs.weight,
        });
    }

    // Next steps: suggest drilling into discovered targets
    const nextSteps: string[] = [];
    const discoveredEntities = new Set<string>();
    for (const t of triples) {
        const tAttrs = graph.getNodeAttributes(t.target);
        if (tAttrs.type === 'entity' && t.target !== eId && !discoveredEntities.has(t.target)) {
            discoveredEntities.add(t.target);
            nextSteps.push(`graph-explore --seed "${t.targetLabel}"`);
        }
        const sAttrs = graph.getNodeAttributes(t.source);
        if (sAttrs.type === 'entity' && t.source !== eId && !discoveredEntities.has(t.source)) {
            discoveredEntities.add(t.source);
            nextSteps.push(`graph-explore --seed "${t.sourceLabel}"`);
        }
    }

    // Also suggest following other relations from this entity
    const allRelations = new Set<string>();
    graph.forEachOutEdge(eId, (_edge: string, attrs: GraphEdgeAttrs) => {
        allRelations.add(attrs.relation);
    });
    graph.forEachInEdge(eId, (_edge: string, attrs: GraphEdgeAttrs) => {
        allRelations.add(attrs.relation);
    });
    const unexplored = [...allRelations].filter(r => !relationSet.has(r));
    if (unexplored.length > 0) {
        nextSteps.push(`graph-drill --seed "${attrs.label}" --relations "${unexplored.slice(0, 3).join(',')}"`);
    }

    return {
        seed: eId,
        relations,
        triples,
        nextSteps,
    };
}

// ── Dead End Detection ────────────────────────────────────────────

/** Detect if an entity is a dead end and suggest alternatives. */
export function detectDeadEnd(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    entityId: string,
    visited?: Set<string>,
): DeadEndInfo | null {
    if (!graph.hasNode(entityId)) return null;

    const degree = getEntityDegree(graph, entityId);
    const visitedSet = visited || new Set<string>();

    // Already visited
    if (visitedSet.has(entityId)) {
        const alternatives = rankAlternativePaths(graph, entityId, visitedSet);
        return {
            entityId,
            reason: 'already_visited',
            alternativePaths: alternatives,
        };
    }

    // Only mentioned_in edges (leaf entity — no semantic relationships)
    // Check this before low_degree because a degree-1 entity with only
    // mentioned_in is more precisely described as "only_mentioned_in"
    const outEdges = graph.outEdges(entityId);
    const inEdges = graph.inEdges(entityId);
    const allRelations: string[] = [];
    for (const edge of outEdges) {
        allRelations.push(graph.getEdgeAttributes(edge).relation);
    }
    for (const edge of inEdges) {
        allRelations.push(graph.getEdgeAttributes(edge).relation);
    }
    const uniqueRelations = new Set(allRelations);
    if (uniqueRelations.size === 1 && uniqueRelations.has('mentioned_in')) {
        const alternatives = rankAlternativePaths(graph, entityId, visitedSet);
        return {
            entityId,
            reason: 'only_mentioned_in',
            alternativePaths: alternatives,
        };
    }

    // Low degree (≤ 1) — but not only mentioned_in (already handled above)
    if (degree <= 1) {
        const alternatives = rankAlternativePaths(graph, entityId, visitedSet);
        return {
            entityId,
            reason: 'low_degree',
            alternativePaths: alternatives,
        };
    }

    return null;
}

/** Rank alternative paths from visited nodes with unexplored relations. */
function rankAlternativePaths(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    _deadEndId: string,
    visited: Set<string>,
): DeadEndInfo['alternativePaths'] {
    const candidates: Array<{
        fromEntity: string;
        fromLabel: string;
        relation: string;
        toEntity: string;
        toLabel: string;
        score: number;
    }> = [];

    for (const vId of visited) {
        if (!graph.hasNode(vId)) continue;
        const vAttrs = graph.getNodeAttributes(vId);
        const vDegree = getEntityDegree(graph, vId);

        // Count visited neighbors
        let visitedCount = 0;
        let totalCount = 0;
        graph.forEachNeighbor(vId, (neighbor: string) => {
            totalCount++;
            if (visited.has(neighbor)) visitedCount++;
        });

        const visitedRatio = totalCount > 0 ? visitedCount / totalCount : 1;

        // Find unexplored outgoing edges from visited nodes
        const outEdges = graph.outEdges(vId);
        for (const edge of outEdges) {
            const target = graph.target(edge);
            if (visited.has(target)) continue;

            const edgeAttrs = graph.getEdgeAttributes(edge);
            const targetAttrs = graph.getNodeAttributes(target);
            const targetScore = targetAttrs.score ?? 1;

            const score = edgeAttrs.weight * targetScore * (1 - visitedRatio);

            candidates.push({
                fromEntity: vId,
                fromLabel: vAttrs.label,
                relation: edgeAttrs.relation,
                toEntity: target,
                toLabel: targetAttrs.label,
                score,
            });
        }
    }

    // Sort by score descending, return top 3
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 3);
}

// ── Graph Traverse (path nodes) ───────────────────────────────────

export interface TraverseResult {
    pathId: string;
    pathType: string;
    label: string;
    hops: Array<{
        index: number;
        entityId: string;
        entityLabel: string;
        entityType: string;
        relation?: string;
    }>;
    sources: {
        resultCount: number;
        domains: string[];
        resultIds: string[];
    };
}

/** Traverse a path: node and return the ordered reasoning chain. */
export function traversePath(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    pathId: string,
): TraverseResult | { error: string; availablePaths: string[]; code?: 'PATH_INVALID' } {
    if (!graph.hasNode(pathId)) {
        const availablePaths = findAvailablePaths(graph);
        return {
            error: `Path "${pathId}" not found`,
            availablePaths,
        };
    }

    const pathAttrs = graph.getNodeAttributes(pathId);
    if (pathAttrs.type !== 'path') {
        const availablePaths = findAvailablePaths(graph);
        return {
            error: `Node "${pathId}" is not a path node`,
            availablePaths,
        };
    }

    const entityIds = pathAttrs.entities || [];
    if (entityIds.some(id => !graph.hasNode(id))) {
        return { error: `Path "${pathId}" references a missing entity`, code: 'PATH_INVALID', availablePaths: findAvailablePaths(graph) };
    }
    const hops: TraverseResult['hops'] = [];

    for (let i = 0; i < entityIds.length; i++) {
        const eId = entityIds[i];
        const eAttrs = graph.hasNode(eId) ? graph.getNodeAttributes(eId) : null;

        // Find the relation between consecutive entities
        let relation: string | undefined;
        if (i > 0) {
            const prevId = entityIds[i - 1];
            const forward = graph.edges(prevId, eId)[0];
            const reverse = graph.edges(eId, prevId)[0];
            if (forward) {
                relation = graph.getEdgeAttributes(forward).relation;
            } else if (reverse) {
                relation = graph.getEdgeAttributes(reverse).relation;
            }
        }

        hops.push({
            index: i + 1,
            entityId: eId,
            entityLabel: eAttrs?.label || eId,
            entityType: eAttrs?.entityType || eAttrs?.type || 'unknown',
            relation,
        });
    }

    // Collect source info: results that mention entities in this path
    const domainSet = new Set<string>();
    const resultIds = new Set<string>();

    for (const eId of entityIds) {
        if (!graph.hasNode(eId)) continue;

        // Check incoming edges for "mentions" (result → entity)
        const inEdges = graph.inEdges(eId);
        for (const edge of inEdges) {
            const source = graph.source(edge);
            const sourceAttrs = graph.getNodeAttributes(source);
            if (sourceAttrs.type === 'result') {
                resultIds.add(source);
                if (sourceAttrs.url) {
                    try {
                        const domain = new URL(sourceAttrs.url).hostname;
                        domainSet.add(domain);
                    } catch { /* skip */ }
                }
            }
        }

        if (graph.getNodeAttributes(eId).sourceResultIds) {
            for (const source of graph.getNodeAttributes(eId).sourceResultIds!) {
                resultIds.add(source);
            }
        }
    }

    return {
        pathId,
        pathType: pathAttrs.pathType || 'unknown',
        label: pathAttrs.label,
        hops,
        sources: {
            resultCount: resultIds.size,
            domains: [...domainSet],
            resultIds: [...resultIds].sort(),
        },
    };
}

function findAvailablePaths(graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): string[] {
    const paths: string[] = [];
    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'path') paths.push(node);
    });
    return paths;
}

// ── Graph Search ──────────────────────────────────────────────────

export interface SearchResult {
    id: string;
    label: string;
    score: number;
}

/** Keyword search across entity labels. Returns entity IDs ranked by score × degree. */
export function searchEntities(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    keyword: string,
    limit: number = 10,
): SearchResult[] {
    const lowerKeyword = keyword.toLowerCase();
    const results: SearchResult[] = [];

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type !== 'entity') return;

        const label = attrs.label.toLowerCase();
        // Match if keyword is contained in label or label contains keyword
        if (!label.includes(lowerKeyword)) return;

        const degree = getEntityDegree(graph, node);
        const entityScore = attrs.score ?? 1;
        const score = entityScore * degree;

        results.push({
            id: node,
            label: attrs.label,
            score,
        });
    });

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
}

// ── Helpers ───────────────────────────────────────────────────────

/** Find entity node by label (case-insensitive). */
function findEntityByLabel(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    label: string,
): string | null {
    const lowerLabel = label.toLowerCase();
    let found: string | null = null;

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity' && attrs.label.toLowerCase() === lowerLabel) {
            found = node;
        }
    });

    return found;
}

/** Suggest similar entities using Levenshtein distance. */
function suggestSimilarEntities(
    graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>,
    label: string,
): EntitySuggestion[] {
    const entityLabels: string[] = [];
    const labelToId = new Map<string, string>();

    graph.forEachNode((node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'entity') {
            entityLabels.push(attrs.label);
            labelToId.set(attrs.label, node);
        }
    });

    if (entityLabels.length === 0) return [];

    const suggestions: EntitySuggestion[] = [];

    const scored = entityLabels
        .map(l => ({ label: l, distance: levenshteinDistance(label, l) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 5);

    for (const s of scored) {
        const id = labelToId.get(s.label);
        if (id) {
            suggestions.push({ id, label: s.label, distance: s.distance });
        }
    }

    return suggestions;
}

/** Generate suggested next steps for explore result. */
function generateExploreNextSteps(
    entityId: string,
    entityLabel: string,
    outgoing: RelationGroup[],
    incoming: RelationGroup[],
): string[] {
    const steps: string[] = [];

    // Suggest drilling into top relation groups
    for (const group of outgoing.slice(0, 2)) {
        steps.push(`graph-drill --seed "${entityLabel}" --relations "${group.relation}"`);
    }

    // Suggest exploring connected entity targets
    const entityTargets = new Set<string>();
    for (const group of outgoing) {
        for (const t of group.targets) {
            if (t.type === 'entity' && t.nodeId !== entityId && !entityTargets.has(t.label)) {
                entityTargets.add(t.label);
                steps.push(`graph-explore --seed "${t.label}"`);
                if (entityTargets.size >= 3) break;
            }
        }
        if (entityTargets.size >= 3) break;
    }

    // Suggest exploring from incoming entity sources
    for (const group of incoming) {
        for (const t of group.targets) {
            if (t.type === 'entity' && t.nodeId !== entityId && !entityTargets.has(t.label)) {
                entityTargets.add(t.label);
                steps.push(`graph-explore --seed "${t.label}"`);
                if (entityTargets.size >= 5) break;
            }
        }
        if (entityTargets.size >= 5) break;
    }

    return steps.slice(0, 5);
}

// ── Formatting ────────────────────────────────────────────────────

/** Format explore result as Markdown. */
export function formatExploreAsMarkdown(result: ExploreResult): string {
    const lines: string[] = [];
    lines.push(`## Entity: ${result.entity.label} (${result.entity.type}, degree: ${result.entity.degree})`);
    lines.push('');

    if (result.outgoingRelations.length > 0) {
        const totalOut = result.outgoingRelations.reduce((sum, g) => sum + g.targets.length, 0);
        lines.push(`### Outgoing Relations (${totalOut})`);
        lines.push('');
        lines.push('| # | Relation | Target | Target Type | Weight |');
        lines.push('|---|----------|--------|-------------|--------|');
        let idx = 1;
        for (const group of result.outgoingRelations) {
            for (const t of group.targets) {
                lines.push(`| ${idx++} | ${group.relation} | ${t.label} | ${t.type} | ${t.weight.toFixed(2)} |`);
            }
        }
        lines.push('');
    }

    if (result.incomingRelations.length > 0) {
        const totalIn = result.incomingRelations.reduce((sum, g) => sum + g.targets.length, 0);
        lines.push(`### Incoming Relations (${totalIn})`);
        lines.push('');
        lines.push('| # | Relation | Source | Source Type | Weight |');
        lines.push('|---|----------|--------|-------------|--------|');
        let idx = 1;
        for (const group of result.incomingRelations) {
            for (const t of group.targets) {
                lines.push(`| ${idx++} | ${group.relation} | ${t.label} | ${t.type} | ${t.weight.toFixed(2)} |`);
            }
        }
        lines.push('');
    }

    if (result.suggestedNextSteps.length > 0) {
        lines.push('### Next Steps');
        lines.push('');
        for (const step of result.suggestedNextSteps) {
            lines.push(`- \`${step}\``);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/** Format drill result as Markdown. */
export function formatDrillAsMarkdown(result: DrillResult): string {
    const lines: string[] = [];
    const seedAttrs = result.seed;
    lines.push(`## Drill: ${seedAttrs} → [${result.relations.join(', ')}]`);
    lines.push('');

    // Group triples by relation
    const byRelation = new Map<string, DrillResult['triples']>();
    for (const t of result.triples) {
        const group = byRelation.get(t.relation) || [];
        group.push(t);
        byRelation.set(t.relation, group);
    }

    for (const [relation, triples] of byRelation) {
        lines.push(`### ${relation}`);
        lines.push('');
        lines.push('| Source | Target | Weight |');
        lines.push('|--------|--------|--------|');
        for (const t of triples) {
            lines.push(`| ${t.sourceLabel} | ${t.targetLabel} | ${t.weight.toFixed(2)} |`);
        }
        lines.push('');
    }

    if (result.nextSteps.length > 0) {
        lines.push('### Next Steps');
        lines.push('');
        for (const step of result.nextSteps) {
            lines.push(`- \`${step}\``);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/** Format dead-end info as Markdown. */
export function formatDeadEndAsMarkdown(info: DeadEndInfo): string {
    const lines: string[] = [];
    const reasonLabels: Record<string, string> = {
        low_degree: 'Low degree (leaf node)',
        only_mentioned_in: 'Only has "mentioned_in" edges',
        already_visited: 'Already visited',
    };
    lines.push(`### Dead End: ${info.entityId}`);
    lines.push(`**Reason:** ${reasonLabels[info.reason] || info.reason}`);
    lines.push('');

    if (info.alternativePaths.length > 0) {
        lines.push('**Alternative Paths:**');
        lines.push('');
        lines.push('| From | Relation | To | Score |');
        lines.push('|------|----------|----|-------|');
        for (const p of info.alternativePaths) {
            lines.push(`| ${p.fromLabel} | ${p.relation} | ${p.toLabel} | ${p.score.toFixed(3)} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/** Format traverse result as Markdown. */
export function formatTraverseAsMarkdown(result: TraverseResult): string {
    const lines: string[] = [];
    lines.push(`## Path: ${result.label}`);
    lines.push('');

    lines.push('| Hop | Entity | Relation | Type |');
    lines.push('|-----|--------|----------|------|');
    for (const hop of result.hops) {
        lines.push(`| ${hop.index} | ${hop.entityLabel} | ${hop.relation || '-'} | ${hop.entityType} |`);
    }
    lines.push('');

    if (result.sources.resultCount > 0 || result.sources.domains.length > 0) {
        lines.push('### Sources');
        lines.push('');
        lines.push(`- Mentioned in ${result.sources.resultCount} results`);
        if (result.sources.resultIds.length > 0) {
            lines.push(`- Source results: ${result.sources.resultIds.join(', ')}`);
        }
        if (result.sources.domains.length > 0) {
            lines.push(`- Domains: ${result.sources.domains.slice(0, 5).join(', ')}`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

/** Format search results as Markdown. */
export function formatSearchAsMarkdown(results: SearchResult[], keyword: string): string {
    const lines: string[] = [];
    lines.push(`## Search: "${keyword}"`);
    lines.push('');
    lines.push(`**${results.length} entities found**`);
    lines.push('');
    lines.push('| # | Entity | Score |');
    lines.push('|---|--------|-------|');
    for (let i = 0; i < results.length; i++) {
        lines.push(`| ${i + 1} | ${results[i].label} | ${results[i].score.toFixed(2)} |`);
    }
    lines.push('');
    return lines.join('\n');
}
