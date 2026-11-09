import { expect, it, vi } from 'vitest';
import { runCli } from '../../src/runCli.js';

const state = vi.hoisted(() => ({ stored: [] as any[] }));
vi.mock('fs', async original => {
    const fs = await original<typeof import('fs')>();
    return { ...fs, readFileSync: (path: any, ...args: any[]) => String(path) === 'merge-fixture.json'
        ? JSON.stringify({ results: [{ url: 'https://merged.test', title: 'merged', content: 'merged', engine: 'test', category: 'general' }] })
        : (fs.readFileSync as any)(path, ...args) };
});
vi.mock('../../src/deep/session.js', async original => ({
    ...await original<typeof import('../../src/deep/session.js')>(),
    resolveSessionPath: () => 'session', initSessionDir: vi.fn(),
    loadSessionResults: () => [], countPendingResults: () => 0,
    injectApprovedResults: vi.fn(),
    appendSessionResults: (_: string, results: any[]) => {
        state.stored = results;
        return { added: results.length, updated: 0, total: results.length, round: 1, approvedResults: [] };
    },
}));

it('passes selected merged results to session storage and prints them', async () => {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    const service = { search: vi.fn().mockResolvedValue({
        query: 'q', numberOfResults: 1,
        results: [{ url: 'https://live.test', title: 'live', content: 'live', engine: 'test', category: 'general' }],
        suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
    }) };
    await runCli(['q', '--session', 'session', '--merge', 'merge-fixture.json', '--format', 'json', '--limit', '5'], service as any);
    const displayed = JSON.parse(output.mock.calls.at(-1)![0] as string).data.results.map((r: any) => r.url);
    expect(displayed).toContain('https://merged.test');
    expect(state.stored.map(r => r.url)).toEqual(displayed);
    output.mockRestore();
});
