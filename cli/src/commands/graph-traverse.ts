/**
 * graph-traverse subcommand — Traverse reasoning path by path node ID
 */

import { resolveSessionPath, loadSessionGraph } from '../deep/session.js';
import { GraphNodeAttrs } from '../deep/graph.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { traversePath, formatTraverseAsMarkdown } from '../deep/graph-explore.js';

export interface GraphTraverseOptions {
    session: string;
    pathId: string;
    format?: 'json' | 'md';
}

export async function runGraphTraverse(options: GraphTraverseOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    const graph = loadSessionGraph(sessionDir);

    // Check if graph has any path nodes
    let pathCount = 0;
    graph.forEachNode((_node: string, attrs: GraphNodeAttrs) => {
        if (attrs.type === 'path') pathCount++;
    });
    if (pathCount === 0) {
        const envelope = createErrorEnvelope('NO_PATHS', '当前图谱尚无推理路径。请先通过 graph-preprocess 和 graph-add 构建语义层。', {
            hint: 'Run: digdig graph-preprocess <session> then digdig graph-add <session> --data \'...\'',
        });
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    const result = traversePath(graph, options.pathId);

    if ('error' in result) {
        const envelope = createErrorEnvelope('PATH_NOT_FOUND', result.error, {
            details: { availablePaths: result.availablePaths },
        });
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    if (options.format === 'md') {
        console.log(formatTraverseAsMarkdown(result));
    } else {
        console.log(JSON.stringify(createSuccessEnvelope(result), null, 2));
    }
    return 0;
}