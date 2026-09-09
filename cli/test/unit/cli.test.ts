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
        expect(program.name()).toBe('sxng');
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
        expect(commandNames).toContain('recovery-analysis');
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

            expect(loadSessionResults(sessionDir)[0].origins).toEqual([{ tool: 'sxng', engine: 'test', query: 'origin query', round: 1 }]);
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
                [{ tool: 'sxng', engine: 'test', query: 'first query', round: 1 }],
                [{ tool: 'sxng', engine: 'test', query: 'second query', round: 1 }],
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

    it('rejects approval of an unverified result and returns quality diagnostics', async () => {
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
            expect(result.error.details.quality).toBeDefined();
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
