/**
 * graph-obfuscate subcommand - List obfuscation candidates or apply fallback rules
 *
 * Primary flow: Agent uses --list to get candidates, then LLM generates
 * obfuscated labels, and writes them back via graph-add.
 *
 * Fallback: --fallback-rules applies simple rule-based obfuscation (experimental).
 */

import { readFileSync, writeFileSync, existsSync, renameSync, rmSync } from 'fs';
import { basename, dirname, join } from 'path';
import { randomUUID } from 'crypto';
import { deserializeGraph, serializeGraph, graphStats, GraphNodeAttrs, GraphEdgeAttrs } from '../deep/graph.js';
import { runGraphObfuscate, ObfuscationConfig, ObfuscationResult } from '../deep/graph-obfuscate.js';
import { DirectedGraph } from 'graphology';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';
import { loadSessionGraph, mutateSessionGraph } from '../deep/session.js';
import { withSessionRead } from '../deep/session-store.js';
import { resolveGraphInput } from './graph-input.js';

function loadGraph(graphFile: string): DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> | null {
    if (!existsSync(graphFile)) {
        return null;
    }
    try {
        const raw = readFileSync(graphFile, 'utf-8');
        const parsed = JSON.parse(raw);
        const graphData = parsed.status === 'ok' && parsed.data?.graph
            ? parsed.data.graph
            : (parsed.nodes && parsed.edges ? parsed : null);
        return graphData ? deserializeGraph(graphData) : null;
    } catch {
        return null;
    }
}

function saveGraph(graphFile: string, graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs>): void {
    const serialized = serializeGraph(graph);
    const stats = graphStats(graph);
    const temp = join(dirname(graphFile), `.${basename(graphFile)}.${randomUUID()}.tmp`);
    try {
        writeFileSync(temp, JSON.stringify({ status: 'ok', data: { graph: serialized, stats } }, null, 2), 'utf-8');
        renameSync(temp, graphFile);
    } catch (error) {
        try { rmSync(temp, { force: true }); } catch { /* preserve the original error */ }
        throw error;
    }
}

function formatAsMarkdown(result: ObfuscationResult): string {
    const lines: string[] = [];
    lines.push('## Entity Obfuscation');
    lines.push('');
    lines.push(`**Mode:** ${result.mode}`);
    lines.push(`**Total entities:** ${result.stats.totalEntities}`);
    lines.push(`**Already obfuscated:** ${result.stats.alreadyObfuscated}`);
    lines.push(`**Need obfuscation:** ${result.stats.needObfuscation}`);
    lines.push('');

    if (result.mode === 'list') {
        lines.push('### Candidates');
        lines.push('');
        for (const c of result.candidates) {
            const status = c.hasObfuscatedLabel
                ? `✓ ${c.obfuscatedLabel}`
                : '✗ needs obfuscation';
            lines.push(`- **${c.label}** (${c.entityType ?? 'unknown'}): ${status}`);
        }
        lines.push('');
    }

    if (result.mode === 'fallback_rules' && result.fallbackResults) {
        lines.push('### Fallback Rules Applied ⚠️ *experimental*');
        lines.push('');
        lines.push('| Original | Obfuscated | Rule |');
        lines.push('|----------|------------|------|');
        for (const r of result.fallbackResults) {
            lines.push(`| ${r.original} | ${r.obfuscated} | ${r.rule} |`);
        }
        lines.push('');
        lines.push('*Fallback rules are experimental — they preserve too many identifying cues for true obfuscation.*');
        lines.push('');
    }

    return lines.join('\n');
}

export interface GraphObfuscateOptions {
    graphFile: string;
    list: boolean;
    fallbackRules: boolean;
    format: 'json' | 'md';
    skipEntityTypes?: string[];
}

export async function runGraphObfuscateCommand(options: GraphObfuscateOptions): Promise<number> {
    const { graphFile, sessionDir } = resolveGraphInput(options.graphFile);
    const exists = sessionDir
        ? Boolean(withSessionRead(sessionDir, db => db.prepare('SELECT 1 FROM graph_snapshot WHERE id = 1').get()))
        : existsSync(graphFile);
    const graph = sessionDir ? (exists ? loadSessionGraph(sessionDir) : null) : loadGraph(graphFile);
    if (!graph) {
        const envelope = createErrorEnvelope(
            'GRAPH_LOAD_FAILED',
            `Failed to load graph from: ${graphFile}`,
            { hint: 'Ensure the file exists and contains a valid graphology graph' }
        );
        console.log(JSON.stringify(envelope, null, 2));
        return 1;
    }

    const mode: 'list' | 'fallback_rules' = options.fallbackRules ? 'fallback_rules' : 'list';
    const config: ObfuscationConfig = {
        mode,
        skipEntityTypes: options.skipEntityTypes,
    };

    const result = sessionDir && mode === 'fallback_rules'
        ? mutateSessionGraph(sessionDir, current => runGraphObfuscate(current, config))
        : runGraphObfuscate(graph, config);

    // Save graph if fallback rules were applied (they mutate the graph)
    if (!sessionDir && mode === 'fallback_rules' && result.fallbackResults && result.fallbackResults.length > 0) {
        try {
            saveGraph(graphFile, graph);
        } catch (error) {
            console.log(JSON.stringify(createErrorEnvelope('GRAPH_WRITE_FAILED', error instanceof Error ? error.message : 'Cannot write graph'), null, 2));
            return 1;
        }
    }

    if (options.format === 'md') {
        console.log(formatAsMarkdown(result));
    } else {
        console.log(JSON.stringify(createSuccessEnvelope(result), null, 2));
    }

    return 0;
}
