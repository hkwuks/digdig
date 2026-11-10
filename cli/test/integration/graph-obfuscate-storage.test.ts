import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createGraph, graphStats, serializeGraph } from '../../src/deep/graph.js';
import { runGraphObfuscateCommand } from '../../src/commands/graph-obfuscate.js';

vi.mock('fs', async original => {
    const actual = await original<typeof import('fs')>();
    return { ...actual, renameSync: vi.fn(actual.renameSync) };
});

describe('standalone graph writes', () => {
    const dirs: string[] = [];
    afterEach(() => {
        vi.restoreAllMocks();
        for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    });

    it('preserves the original graph if atomic replacement fails', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'dg-graph-'));
        dirs.push(dir);
        const file = join(dir, 'standalone.json');
        const graph = createGraph();
        graph.addNode('e:rust', { type: 'entity', label: 'Rust', entityType: 'language' });
        const original = JSON.stringify({ status: 'ok', data: { graph: serializeGraph(graph), stats: graphStats(graph) } });
        writeFileSync(file, original);
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        vi.mocked(renameSync).mockImplementationOnce(() => { throw new Error('injected rename failure'); });
        expect(await runGraphObfuscateCommand({ graphFile: file, list: false, fallbackRules: true, format: 'json' })).toBe(1);
        expect(JSON.parse(log.mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'GRAPH_WRITE_FAILED' } });
        expect(readFileSync(file, 'utf8')).toBe(original);
    });

    it('migrates a graph-only legacy session on its first read', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'dg-graph-session-'));
        dirs.push(dir);
        const file = join(dir, 'graph.json');
        const graph = createGraph();
        graph.addNode('e:rust', { type: 'entity', label: 'Rust', entityType: 'language' });
        const original = JSON.stringify({ status: 'ok', data: { graph: serializeGraph(graph), stats: graphStats(graph) } });
        writeFileSync(file, original);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        expect(await runGraphObfuscateCommand({ graphFile: dir, list: true, fallbackRules: false, format: 'json' })).toBe(0);
        expect(existsSync(join(dir, 'session.sqlite'))).toBe(true);
        expect(readFileSync(file, 'utf8')).toBe(original);
    });
});
