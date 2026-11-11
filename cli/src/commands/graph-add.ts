/** Persist Agent-authored semantic graph data against approved session results. */

import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { entityId, GraphEdgeAttrs, GraphNodeAttrs } from '../deep/graph.js';
import { initSessionDir, mutateSessionGraph, resolveSessionPath } from '../deep/session.js';
import { bodyVersionId } from '../deep/session-db.js';
import { isJsonObject, readSessionJsonInput } from './json-input.js';
import { extractPaths } from '../deep/path-extraction.js';

export interface GraphAddOptions {
    session: string;
    dataFile?: string;
}

interface EntityInput {
    label: string;
    id?: string;
    entityType?: string;
    score?: number;
    obfuscatedLabel?: string;
    frequency?: number;
    sourceResultIds: string[];
}

interface EdgeInput {
    source: string;
    target: string;
    relation: string;
    weight?: number;
    sourceResultIds: string[];
}

type EntityShape = Omit<EntityInput, 'sourceResultIds'> & { sourceResultIds?: unknown };
type EdgeShape = Omit<EdgeInput, 'sourceResultIds'> & { sourceResultIds?: unknown };

function optionalString(value: unknown): boolean { return value === undefined || typeof value === 'string'; }
function optionalNumber(value: unknown): boolean { return value === undefined || (typeof value === 'number' && Number.isFinite(value)); }
function sourceShape(value: unknown): boolean { return value === undefined || (Array.isArray(value) && value.every(id => typeof id === 'string')); }

function isEntityShape(value: unknown): value is EntityShape {
    return isJsonObject(value) && typeof value.label === 'string' && value.label.length > 0
        && optionalString(value.id) && optionalString(value.entityType) && optionalString(value.obfuscatedLabel)
        && optionalNumber(value.score) && optionalNumber(value.frequency) && sourceShape(value.sourceResultIds);
}

function isEdgeShape(value: unknown): value is EdgeShape {
    return isJsonObject(value) && typeof value.source === 'string' && value.source.length > 0
        && typeof value.target === 'string' && value.target.length > 0
        && typeof value.relation === 'string' && value.relation.length > 0
        && optionalNumber(value.weight) && sourceShape(value.sourceResultIds);
}

function sourceIdsAreApproved(ids: unknown, approved: Set<string>): ids is string[] {
    return Array.isArray(ids) && ids.length > 0 && ids.every(id => typeof id === 'string' && approved.has(id));
}

function mergeIds(left: string[] | undefined, right: string[]): string[] {
    return [...new Set([...(left ?? []), ...right])].sort();
}

export async function runGraphAdd(options: GraphAddOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    const input = readSessionJsonInput(sessionDir, [{ option: '--data-file', value: options.dataFile, file: true }]);
    if (!input.ok) {
        console.log(JSON.stringify(createErrorEnvelope(input.code, input.message), null, 2));
        return 1;
    }
    if (!isJsonObject(input.value)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_GRAPH_DATA', 'Graph input must be an object with entities and/or edges arrays'), null, 2));
        return 1;
    }
    const entities = input.value.entities === undefined ? [] : input.value.entities;
    const edges = input.value.edges === undefined ? [] : input.value.edges;
    if (!Array.isArray(entities) || !Array.isArray(edges) || !entities.every(isEntityShape) || !edges.every(isEdgeShape)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_GRAPH_DATA', 'Graph entities and edges must be arrays of valid objects'), null, 2));
        return 1;
    }
    if (!(entities.length || edges.length)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_GRAPH_DATA', 'Graph input must contain at least one entity or edge'), null, 2));
        return 1;
    }

    initSessionDir(sessionDir);
    const mutation = mutateSessionGraph(sessionDir, (graph, approved) => {
        const approvedIds = new Set(approved.map(result => result.id));
        const snapshotIds = Object.fromEntries(approved.filter(result => typeof result.content === 'string').map(result => [result.id, bodyVersionId(result.id, result.content!)]));
        const validEntities: EntityInput[] = [];
        const validEdges: EdgeInput[] = [];
        for (const entity of entities) {
            if (!sourceIdsAreApproved(entity.sourceResultIds, approvedIds)) return { invalidProvenance: true };
            validEntities.push({ ...entity, sourceResultIds: entity.sourceResultIds });
        }
        for (const edge of edges) {
            if (!sourceIdsAreApproved(edge.sourceResultIds, approvedIds)) return { invalidProvenance: true };
            validEdges.push({ ...edge, sourceResultIds: edge.sourceResultIds });
        }
        const collision = validEntities.map(entity => entity.id || entityId(entity.label))
            .find(id => graph.hasNode(id) && graph.getNodeAttribute(id, 'type') !== 'entity');
        if (collision) return { collision };
        let entitiesAdded = 0;
        for (const entity of validEntities) {
            const id = entity.id || entityId(entity.label);
            if (!graph.hasNode(id)) {
                graph.addNode(id, {
                    type: 'entity', label: entity.label, entityType: entity.entityType, score: entity.score,
                    obfuscatedLabel: entity.obfuscatedLabel, frequency: entity.frequency,
                    sourceResultIds: entity.sourceResultIds,
                    sourceSnapshotIds: Object.fromEntries(entity.sourceResultIds.map(id => [id, snapshotIds[id]])),
                    sourceSnapshotBinding: Object.fromEntries(entity.sourceResultIds.map(id => [id, 'anchored' as const])),
                });
                entitiesAdded++;
            } else {
                const previous = graph.getNodeAttributes(id);
                graph.mergeNodeAttributes(id, {
                    ...previous, label: entity.label, entityType: entity.entityType ?? previous.entityType,
                    score: entity.score ?? previous.score, obfuscatedLabel: entity.obfuscatedLabel ?? previous.obfuscatedLabel,
                    frequency: entity.frequency ?? previous.frequency,
                    sourceResultIds: mergeIds(previous.sourceResultIds, entity.sourceResultIds),
                    sourceSnapshotIds: { ...previous.sourceSnapshotIds, ...Object.fromEntries(entity.sourceResultIds.map(id => [id, snapshotIds[id]])) },
                    sourceSnapshotBinding: { ...previous.sourceSnapshotBinding, ...Object.fromEntries(entity.sourceResultIds.map(id => [id, 'anchored' as const])) },
                    pendingSourceResultIds: previous.pendingSourceResultIds?.filter(id => !entity.sourceResultIds.includes(id)),
                });
            }
        }

        let edgesAdded = 0;
        const skippedEdges: Array<{ source: string; target: string; relation: string }> = [];
        for (const edge of validEdges) {
            if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) {
                skippedEdges.push(edge);
                continue;
            }
            const sourceType = graph.getNodeAttribute(edge.source, 'type');
            const targetType = graph.getNodeAttribute(edge.target, 'type');
            const endpointOk = (sourceType === 'entity' && targetType === 'entity')
                || (sourceType === 'result' && targetType === 'entity')
                || (sourceType === 'entity' && targetType === 'result');
            const resultEndpoint = sourceType === 'result' ? edge.source : targetType === 'result' ? edge.target : undefined;
            if (!endpointOk || (resultEndpoint && !edge.sourceResultIds.includes(resultEndpoint))) {
                skippedEdges.push(edge);
                continue;
            }
            const matching = graph.findEdge(edge.source, edge.target, (_key, attrs) => attrs.relation === edge.relation);
            if (matching) {
                const previous = graph.getEdgeAttributes(matching);
                graph.replaceEdgeAttributes(matching, { ...previous, sourceResultIds: mergeIds(previous.sourceResultIds, edge.sourceResultIds), sourceSnapshotIds: { ...previous.sourceSnapshotIds, ...Object.fromEntries(edge.sourceResultIds.map(id => [id, snapshotIds[id]])) }, sourceSnapshotBinding: { ...previous.sourceSnapshotBinding, ...Object.fromEntries(edge.sourceResultIds.map(id => [id, 'anchored' as const])) }, pendingSourceResultIds: previous.pendingSourceResultIds?.filter(id => !edge.sourceResultIds.includes(id)) });
            } else {
                graph.addEdge(edge.source, edge.target, { relation: edge.relation, weight: edge.weight ?? 1, sourceResultIds: edge.sourceResultIds, sourceSnapshotIds: Object.fromEntries(edge.sourceResultIds.map(id => [id, snapshotIds[id]])), sourceSnapshotBinding: Object.fromEntries(edge.sourceResultIds.map(id => [id, 'anchored' as const])) });
                edgesAdded++;
            }
        }
        const paths = extractPaths(graph);
        return { entitiesAdded, edgesAdded, skippedEdges, pathsTruncated: paths.truncated };
    }, { reconcileStructural: true });
    if ('invalidProvenance' in mutation) {
        console.log(JSON.stringify(createErrorEnvelope(
            'INVALID_RESULT_PROVENANCE',
            'Every semantic entity and edge requires one or more currently approved extracted sourceResultIds',
        ), null, 2));
        return 1;
    }
    if ('collision' in mutation) {
        console.log(JSON.stringify(createErrorEnvelope('GRAPH_NODE_ID_CONFLICT', `Entity ID conflicts with an existing non-entity node: ${mutation.collision}`), null, 2));
        return 1;
    }
    const { entitiesAdded, edgesAdded, skippedEdges, pathsTruncated } = mutation;
    console.log(JSON.stringify(createSuccessEnvelope({ entitiesAdded, edgesAdded, skippedEdges: skippedEdges.length ? skippedEdges : undefined, pathsTruncated }), null, 2));
    return 0;
}
