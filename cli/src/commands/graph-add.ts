/** Persist Agent-authored semantic graph data against approved session results. */

import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { entityId, GraphEdgeAttrs, GraphNodeAttrs } from '../deep/graph.js';
import { initSessionDir, mutateSessionGraph, resolveSessionPath } from '../deep/session.js';
import { isJsonObject, readSessionJsonInput } from './json-input.js';

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

function sourceIdsAreApproved(ids: unknown, approved: Set<string>): ids is string[] {
    return Array.isArray(ids) && ids.length > 0 && ids.every(id => typeof id === 'string' && approved.has(id));
}

function mergeIds(left: string[] | undefined, right: string[]): string[] {
    return [...new Set([...(left ?? []), ...right])].sort();
}

export async function runGraphAdd(options: GraphAddOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    initSessionDir(sessionDir);
    const input = readSessionJsonInput(sessionDir, [{ option: '--data-file', value: options.dataFile, file: true }]);
    if (!input.ok) {
        console.log(JSON.stringify(createErrorEnvelope(input.code, input.message), null, 2));
        return 1;
    }
    if (!isJsonObject(input.value)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_GRAPH_DATA', 'Graph input must be an object with entities and/or edges arrays'), null, 2));
        return 1;
    }
    const parsed = input.value as { entities?: EntityInput[]; edges?: EdgeInput[] };
    if (!(parsed.entities?.length || parsed.edges?.length)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_GRAPH_DATA', 'Graph input must contain at least one entity or edge'), null, 2));
        return 1;
    }

    const mutation = mutateSessionGraph(sessionDir, (graph, approved) => {
        const approvedIds = new Set(approved.map(result => result.id));
        const invalidEntity = (parsed.entities ?? []).find(entity => !entity.label || !sourceIdsAreApproved(entity.sourceResultIds, approvedIds));
        const invalidEdge = (parsed.edges ?? []).find(edge => !edge.source || !edge.target || !edge.relation || !sourceIdsAreApproved(edge.sourceResultIds, approvedIds));
        if (invalidEntity || invalidEdge) return { invalidProvenance: true };
        let entitiesAdded = 0;
        for (const entity of parsed.entities ?? []) {
            const id = entity.id || entityId(entity.label);
            if (!graph.hasNode(id)) {
                graph.addNode(id, {
                    type: 'entity', label: entity.label, entityType: entity.entityType, score: entity.score,
                    obfuscatedLabel: entity.obfuscatedLabel, frequency: entity.frequency,
                    sourceResultIds: entity.sourceResultIds,
                });
                entitiesAdded++;
            } else {
                const previous = graph.getNodeAttributes(id);
                graph.mergeNodeAttributes(id, {
                    ...previous, label: entity.label, entityType: entity.entityType ?? previous.entityType,
                    score: entity.score ?? previous.score, obfuscatedLabel: entity.obfuscatedLabel ?? previous.obfuscatedLabel,
                    frequency: entity.frequency ?? previous.frequency,
                    sourceResultIds: mergeIds(previous.sourceResultIds, entity.sourceResultIds),
                });
            }
        }

        let edgesAdded = 0;
        const skippedEdges: Array<{ source: string; target: string; relation: string }> = [];
        for (const edge of parsed.edges ?? []) {
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
                graph.replaceEdgeAttributes(matching, { ...previous, sourceResultIds: mergeIds(previous.sourceResultIds, edge.sourceResultIds) });
            } else {
                graph.addEdge(edge.source, edge.target, { relation: edge.relation, weight: edge.weight ?? 1, sourceResultIds: edge.sourceResultIds });
                edgesAdded++;
            }
        }
        return { entitiesAdded, edgesAdded, skippedEdges };
    }, { reconcileStructural: true });
    if ('invalidProvenance' in mutation) {
        console.log(JSON.stringify(createErrorEnvelope(
            'INVALID_RESULT_PROVENANCE',
            'Every semantic entity and edge requires one or more currently approved extracted sourceResultIds',
        ), null, 2));
        return 1;
    }
    const { entitiesAdded, edgesAdded, skippedEdges } = mutation;
    console.log(JSON.stringify(createSuccessEnvelope({ entitiesAdded, edgesAdded, skippedEdges: skippedEdges.length ? skippedEdges : undefined }), null, 2));
    return 0;
}
