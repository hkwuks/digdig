import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { createProgram, runCli } from '../../src/runCli.js';
import { appendSessionResults, loadSessionResults } from '../../src/deep/session.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgVersion = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')).version;

afterEach(() => {
    vi.restoreAllMocks();
});

function writeSessionInput(sessionDir: string, name: string, value: unknown): string {
    const dir = join(sessionDir, 'agent-inputs');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify(value), 'utf8');
    return file;
}

describe('CLI program (commander)', () => {
    const program = createProgram();

    it('has correct name and version', () => {
        expect(program.name()).toBe('dg');
        expect(program.version()).toBe(pkgVersion);
    });

    it('registers all subcommands', () => {
        const commandNames = program.commands.map(c => c.name());
        expect(commandNames).toContain('init');
        expect(commandNames).toContain('extract');
        expect(commandNames).toContain('query-graph');
        expect(commandNames).toContain('graph-add');
        expect(commandNames).toContain('session-list');
        expect(commandNames).toContain('session-delete');
        expect(commandNames).toContain('graph-preprocess');
        expect(commandNames).toContain('graph-obfuscate');
        expect(commandNames).toContain('suggest-queries');
        expect(commandNames).toContain('strategy-info');
        expect(commandNames).not.toContain('recovery-analysis');
        expect(commandNames).toContain('session-report');
        expect(commandNames).toContain('graph-explore');
        expect(commandNames).toContain('graph-drill');
        expect(commandNames).toContain('graph-traverse');
        expect(commandNames).toContain('graph-search');
    });

    it('registers all top-level options', () => {
        const optionFlags = program.options.map(o => o.flags);
        expect(optionFlags.some(f => f.includes('--engines'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--categories'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--limit'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--format'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--session'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--queries'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--health'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--engines-list'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--categories-list'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--redundancy'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--quality'))).toBe(true);
        expect(optionFlags.some(f => f.includes('--threshold-override'))).toBe(false);
    });

    it('query-graph has seeds, depth, and strategy options', () => {
        const qg = program.commands.find(c => c.name() === 'query-graph');
        expect(qg).toBeDefined();
        const flags = qg!.options.map(o => o.flags);
        expect(flags.some(f => f.includes('--seeds'))).toBe(true);
        expect(flags.some(f => f.includes('--depth'))).toBe(true);
        expect(flags.some(f => f.includes('--strategy'))).toBe(true);
    });

    it('registers JSON file input options for structured write commands', () => {
        const ga = program.commands.find(c => c.name() === 'graph-add');
        expect(ga).toBeDefined();
        expect(ga!.options.some(o => o.flags.includes('--data-file'))).toBe(true);
        const resultsAdd = program.commands.find(c => c.name() === 'results-add');
        expect(resultsAdd!.options.some(o => o.flags.includes('--data-file'))).toBe(true);
        const claimAdd = program.commands.find(c => c.name() === 'claim-add');
        expect(claimAdd!.options.some(o => o.flags.includes('--claim-file'))).toBe(true);
        expect(claimAdd!.options.some(o => o.flags.includes('--claims-file'))).toBe(true);
        const evidenceVerify = program.commands.find(c => c.name() === 'evidence-verify');
        expect(evidenceVerify!.options.some(o => o.flags.includes('--evidence-file'))).toBe(true);
    });

    it('passes extract --session to the extraction command', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-extract-session-test-'));
        appendSessionResults(sessionDir, [{
            url: 'file:///notes.md#chunk-0', title: 'Local note', content: 'Local content.', extractedAt: 1,
        }]);
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['extract', '--session', sessionDir], {} as any);

            const result = JSON.parse(output.mock.calls.at(-1)![0] as string);
            expect(result.error.code).toBe('NO_URLS');
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('graph-obfuscate has --list and --fallback-rules options', () => {
        const go = program.commands.find(c => c.name() === 'graph-obfuscate');
        expect(go).toBeDefined();
        const flags = go!.options.map(o => o.flags);
        expect(flags.some(f => f.includes('--list'))).toBe(true);
        expect(flags.some(f => f.includes('--fallback-rules'))).toBe(true);
    });

    it('prefers fresh search content over a matching session result', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-test-'));
        appendSessionResults(sessionDir, [{
            url: 'https://example.com/article', title: 'Old title', content: 'old', source: 'sxng',
        }]);
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['fresh query', '--session', sessionDir, '--format', 'json'], {
                search: vi.fn().mockResolvedValue({
                    query: 'fresh query',
                    numberOfResults: 1,
                    results: [{
                        url: 'https://example.com/article', title: 'Fresh title', content: 'fresh', engine: 'test', category: 'general',
                    }],
                    suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
                }),
            } as any);

            const result = JSON.parse(output.mock.calls.at(-1)![0] as string);
            expect(result.data.results[0].title).toBe('Fresh title');
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('shows the provider snippet in md output, not the long body behind it', async () => {
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        await runCli(['snippet query', '--format', 'md'], {
            search: vi.fn().mockResolvedValue({
                query: 'snippet query', numberOfResults: 1,
                results: [{
                    url: 'https://example.com/snippet', title: 'Snippet', content: 'A three-thousand character abstract.',
                    snippet: 'short blurb', engine: 'deepseek', category: 'general',
                }],
                suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
            }),
        } as any);

        const md = output.mock.calls.at(-1)![0] as string;
        expect(md).toContain('short blurb');
        expect(md).not.toContain('A three-thousand character abstract.');
    });

    it('falls back through excerpt to content when no snippet exists', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-display-test-'));
        // A search result: no `content` is stored, so the fallback must reach `excerpt`.
        appendSessionResults(sessionDir, [{
            url: 'https://example.com/body', title: 'Body', content: 'provider body text',
            origins: [{ tool: 'sxng', query: 'q' }],
        }]);
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli([sessionDir, '--session', sessionDir, '--format', 'md'], {
                search: vi.fn().mockResolvedValue({
                    query: sessionDir, numberOfResults: 1,
                    results: [{
                        url: 'https://example.com/plain', title: 'Plain', content: 'plain body',
                        engine: 'test', category: 'general',
                    }],
                    suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
                }),
            } as any);

            const md = output.mock.calls.at(-1)![0] as string;
            expect(md).toContain('plain body');
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('shows only this invocation results when a session is attached', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-excerpt-display-test-'));
        // A stored search result: its body lives in `excerpt`, not `content`.
        appendSessionResults(sessionDir, [{
            url: 'https://example.com/stored', title: 'Stored', content: 'the stored search body',
            origins: [{ tool: 'sxng', query: 'q' }],
        }]);
        expect(loadSessionResults(sessionDir)[0].excerpt).toBe('the stored search body');
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            // History contributes a vote to the ranking but is never displayed, so a
            // second search shows what it found rather than everything it has seen.
            await runCli(['fresh query', '--session', sessionDir, '--format', 'md'], {
                search: vi.fn().mockResolvedValue({
                    query: 'fresh query', numberOfResults: 1,
                    results: [{
                        url: 'https://example.com/fresh', title: 'Fresh', content: 'fresh body',
                        engine: 'test', category: 'general',
                    }],
                    suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
                }),
            } as any);

            const md = output.mock.calls.at(-1)![0] as string;
            expect(md).toContain('fresh body');
            expect(md).not.toContain('the stored search body');
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('keeps history out of the result list but still stores what this run found', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-history-test-'));
        appendSessionResults(sessionDir, [{
            url: 'https://example.com/old', title: 'Old', content: 'old body',
            origins: [{ tool: 'sxng', query: 'previous' }],
        }]);
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['second query', '--session', sessionDir, '--format', 'json'], {
                search: vi.fn().mockResolvedValue({
                    query: 'second query', numberOfResults: 1,
                    results: [{
                        url: 'https://example.com/new', title: 'New', content: 'new body',
                        engine: 'test', category: 'general',
                    }],
                    suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
                }),
            } as any);

            const result = JSON.parse(output.mock.calls.at(-1)![0] as string);
            expect(result.data.results.map((r: any) => r.url)).toEqual(['https://example.com/new']);
            expect(loadSessionResults(sessionDir).map(r => r.url).sort())
                .toEqual(['https://example.com/new', 'https://example.com/old']);
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('reaches the same result set whether the queries arrive in one call or two', async () => {
        // AC2: `--session a "q1"` then `"q2"` must agree in key set with
        // `--session b --queries "q1,q2"` once. Order may differ because the
        // fusion rankings differ, but "what did this session find" must not.
        const responses: Record<string, any> = {
            'q1': {
                query: 'q1', numberOfResults: 2,
                results: [
                    { url: 'https://a.test/1', title: 'A1', content: 'a1', engine: 'test', category: 'general' },
                    { url: 'https://shared.test/page', title: 'Shared', content: 's', engine: 'test', category: 'general' },
                ],
                suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
            },
            'q2': {
                query: 'q2', numberOfResults: 2,
                results: [
                    { url: 'https://b.test/2', title: 'B2', content: 'b2', engine: 'test', category: 'general' },
                    // Same page as q1 returned, different fragment spelling.
                    { url: 'https://shared.test/page#x', title: 'Shared', content: 's', engine: 'test', category: 'general' },
                ],
                suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
            },
        };
        const service = { search: vi.fn(async ({ query }: any) => responses[query]) } as any;
        const seqDir = mkdtempSync(join(tmpdir(), 'sxng-ac2-seq-'));
        const batchDir = mkdtempSync(join(tmpdir(), 'sxng-ac2-batch-'));
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['q1', '--session', seqDir, '--format', 'json'], service);
            await runCli(['q2', '--session', seqDir, '--format', 'json'], service);
            await runCli(['--queries', 'q1,q2', '--session', batchDir, '--format', 'json'], service);

            const keysOf = (dir: string) => loadSessionResults(dir).map(r => r.url).sort();
            expect(keysOf(seqDir)).toEqual(keysOf(batchDir));
            // And the fragment-collapsed shared page is one result, not two.
            expect(keysOf(seqDir)).toHaveLength(3);
        } finally {
            rmSync(seqDir, { recursive: true, force: true });
            rmSync(batchDir, { recursive: true, force: true });
        }
    });

    it('reports totalResults as every fused candidate and returnedResults as what it printed', async () => {
        // AC9: totalResults is the deduplicated candidate pool; returnedResults is
        // the truncation actually shown. They were previously both the display
        // length, so `--limit 2` over four candidates looked like a pool of two.
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-ac9-counts-'));
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['counted query', '--limit', '2', '--session', sessionDir, '--format', 'json'], {
                search: vi.fn().mockResolvedValue({
                    query: 'q', numberOfResults: 4,
                    results: [1, 2, 3, 4].map(i => ({
                        url: `https://counts.test/${i}`, title: `T${i}`, content: `c${i}`,
                        engine: 'test', category: 'general',
                    })),
                    suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
                }),
            } as any);

            const result = JSON.parse(output.mock.calls.at(-1)![0] as string).data;
            expect(result.results).toHaveLength(2);
            expect(result.returnedResults).toBe(2);
            expect(result.totalResults).toBe(4);
            expect(result.totalResults).toBeGreaterThanOrEqual(result.returnedResults);
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('keeps the source score unchanged and persists retrieval time', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-score-test-'));
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['score query', '--session', sessionDir, '--format', 'md'], {
                search: vi.fn().mockResolvedValue({
                    query: 'score query', numberOfResults: 1,
                    results: [{
                        url: 'https://example.com/score', title: 'Score', content: 'content',
                        engine: 'test', category: 'general', score: 2.4, retrievedAt: 1234,
                    }],
                    suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
                }),
            } as any);

            expect(output.mock.calls.at(-1)![0]).toContain('Source score: 2.4');
            expect(output.mock.calls.at(-1)![0]).not.toContain('240.0');
            expect(loadSessionResults(sessionDir)[0]).toMatchObject({ score: 2.4, retrievedAt: 1234 });
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('keeps source score separate from RRF fusion score', async () => {
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const search = vi.fn()
            .mockResolvedValueOnce({
                query: 'first', numberOfResults: 1,
                results: [{ url: 'https://example.com/shared', title: 'Shared', content: 'one', engine: 'a', category: 'general', score: 4 }],
                suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
            })
            .mockResolvedValueOnce({
                query: 'second', numberOfResults: 1,
                results: [{ url: 'https://example.com/shared', title: 'Shared', content: 'two', engine: 'b', category: 'general', score: 0.2 }],
                suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
            });

        await runCli(['--queries', 'first,second', '--format', 'json'], { search } as any);

        const result = JSON.parse(output.mock.calls.at(-1)![0] as string);
        expect(result.data.results[0].score).toBe(4);
        expect(result.data.results[0].fusionScore).toBeGreaterThan(0);
    });

    it('stores the single-query origin and allocated round in the session result', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-origin-test-'));
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['origin query', '--session', sessionDir, '--format', 'json'], {
                search: vi.fn().mockResolvedValue({
                    query: 'origin query', numberOfResults: 1,
                    results: [{ url: 'https://example.com/origin', title: 'Origin', content: 'origin', engine: 'test', category: 'general' }],
                    suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
                }),
            } as any);

            expect(loadSessionResults(sessionDir)[0].origins).toEqual([{ tool: 'digdig', engine: 'test', query: 'origin query', round: 1 }]);
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('stores only the queries that returned each multi-query result', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-origin-test-'));
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const search = vi.fn()
            .mockResolvedValueOnce({
                query: 'first query', numberOfResults: 1,
                results: [{ url: 'https://example.com/first', title: 'First', content: 'first', engine: 'test', category: 'general' }],
                suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
            })
            .mockResolvedValueOnce({
                query: 'second query', numberOfResults: 1,
                results: [{ url: 'https://example.com/second', title: 'Second', content: 'second', engine: 'test', category: 'general' }],
                suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
            });

        try {
            await runCli(['--queries', 'first query,second query', '--session', sessionDir, '--format', 'json'], { search } as any);

            expect(loadSessionResults(sessionDir).map(result => result.origins)).toEqual([
                [{ tool: 'digdig', engine: 'test', query: 'first query', round: 1 }],
                [{ tool: 'digdig', engine: 'test', query: 'second query', round: 1 }],
            ]);
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('accepts space-separated values for --queries', async () => {
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        const search = vi.fn((query: string) => Promise.resolve({
            query, numberOfResults: 0, results: [],
            suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
        }));

        await runCli(['--queries', 'first query', 'second query', '--format', 'json'], { search } as any);

        expect(search.mock.calls.map(([options]) => options.query)).toEqual(['first query', 'second query']);
        expect(JSON.parse(output.mock.calls.at(-1)![0] as string).data.queries).toEqual(['first query', 'second query']);
    });

    it('rejects approval of an unverified result and returns the session facts', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-approval-test-'));
        appendSessionResults(sessionDir, [{
            url: 'https://example.com/summary', title: 'Summary', content: 'Search snippet only.', source: 'exa',
        }]);
        const [result] = loadSessionResults(sessionDir);
        const selection = writeSessionInput(sessionDir, 'reject-approval.json', [{ id: result.id, revision: result.revision }]);
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['--session', sessionDir, '--quality', '--approve-file', selection, '--format', 'json'], {} as any);

            const result = JSON.parse(output.mock.calls.at(-1)![0] as string);
            expect(result).toMatchObject({
                status: 'error',
                error: { code: 'RESULT_NOT_VERIFIED' },
            });
            expect(result.error.details.facts).toBeDefined();
            expect(result.error.details.facts).not.toHaveProperty('verdict');
            expect(result.error.details.selectedResults).toEqual([
                expect.objectContaining({ source: 'exa', verified: false }),
            ]);
            expect(loadSessionResults(sessionDir)[0].status).toBe('pending');
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });

    it('approves a verified result and reports its verification state', async () => {
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-cli-approval-test-'));
        appendSessionResults(sessionDir, [{
            url: 'https://example.com/article', title: 'Article', content: 'Captured source content.', extractedAt: 1,
        }]);
        const [result] = loadSessionResults(sessionDir);
        const selection = writeSessionInput(sessionDir, 'approve.json', [{ id: result.id, revision: result.revision }]);
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

        try {
            await runCli(['--session', sessionDir, '--quality', '--approve-file', selection, '--format', 'json'], {} as any);

            const result = JSON.parse(output.mock.calls.at(-1)![0] as string);
            expect(result.data).toMatchObject({
                approved: 1,
                selectedResults: [expect.objectContaining({ verified: true })],
            });
            expect(loadSessionResults(sessionDir)[0].status).toBe('approved');
        } finally {
            rmSync(sessionDir, { recursive: true, force: true });
        }
    });
});
