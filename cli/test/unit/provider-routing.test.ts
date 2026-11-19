import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const installedTavily = vi.hoisted(() => ({ ready: vi.fn(), status: vi.fn().mockResolvedValue('not_installed'), search: vi.fn(), extract: vi.fn() }));
vi.mock('../../src/deep/installed-tavily.js', () => ({
    installedTavilyReady: installedTavily.ready,
    installedTavilyStatus: installedTavily.status,
    installedTavilySearch: installedTavily.search,
    installedTavilyExtract: installedTavily.extract,
}));

// The router constructs providers internally from the shared config, so the two
// provider modules are mocked to observe which ones actually ran — no API key
// and no network are needed to exercise the routing and merge logic.
const deepseekSearch = vi.fn();
const ollamaSearch = vi.fn();

// The ceiling constants travel with the class: the router reads both from the
// provider module, so a mock that omits one hides the code path under test.
vi.mock('../../src/deepseek-service.js', () => ({
    MAX_RESULTS: 50,
    DeepSeekService: class {
        constructor(readonly opts: { apiKey: string }) {}
        search = deepseekSearch;
    },
}));

vi.mock('../../src/ollama-service.js', () => ({
    MAX_RESULTS: 10,
    OllamaService: class {
        constructor(readonly opts: { apiKey: string }) {}
        search = ollamaSearch;
    },
}));

import { runCli } from '../../src/runCli.js';
import { config } from '../../src/config.js';

const originalKeys = { ollama: config.ollamaApiKey, deepseek: config.deepseekApiKey, defaultLimit: config.defaultLimit, baseUrl: config.baseUrl, defaultEngine: config.defaultEngine, allowedEngines: config.allowedEngines };

function providerResponse(engine: string, url: string) {
    return {
        query: 'q',
        numberOfResults: 1,
        results: [{ title: engine, url, content: engine, engine, category: 'general' }],
        suggestions: [],
        answers: [],
        corrections: [],
        infoboxes: [],
        unresponsiveEngines: [],
    };
}

function stubSxng() {
    return {
        search: vi.fn().mockResolvedValue(providerResponse('google', 'https://sxng.test')),
    };
}

async function run(args: string[], service: unknown): Promise<any> {
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    // The default-command action exits with the search's status code; stub it so
    // a failure case reports through the envelope rather than killing the runner.
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    await runCli(args, service as never);
    const last = output.mock.calls.at(-1)![0] as string;
    output.mockRestore();
    return JSON.parse(last);
}

describe('provider routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        config.ollamaApiKey = '';
        config.deepseekApiKey = '';
        config.defaultLimit = 10;
        config.defaultEngine = '';
        config.allowedEngines = [];
        config.baseUrl = 'https://searxng.example';
        deepseekSearch.mockResolvedValue(providerResponse('deepseek', 'https://deepseek.test'));
        ollamaSearch.mockResolvedValue(providerResponse('ollama', 'https://ollama.test'));
    });

    afterEach(() => {
        config.ollamaApiKey = originalKeys.ollama;
        config.deepseekApiKey = originalKeys.deepseek;
        config.defaultLimit = originalKeys.defaultLimit;
        config.baseUrl = originalKeys.baseUrl;
        config.defaultEngine = originalKeys.defaultEngine;
        config.allowedEngines = originalKeys.allowedEngines;
        vi.restoreAllMocks();
    });

    it('routes an explicitly selected configured Exa search without calling SearXNG', async () => {
        vi.stubEnv('EXA_API_KEY', 'test-key');
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [{ title: 'Exa', url: 'https://exa.test' }] }));
        vi.stubGlobal('fetch', fetchMock);
        const service = stubSxng();
        try {
            const envelope = await run(['q', '-e', 'exa', '--format', 'json'], service);
            expect(envelope.status).toBe('ok');
            expect(service.search).not.toHaveBeenCalled();
            expect(fetchMock.mock.calls[0][0]).toBe('https://api.exa.ai/search');
        } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); }
    });

    it('saves Jina search bodies as extracted in the existing session', async () => {
        const { mkdtempSync, rmSync } = await import('fs');
        const { join } = await import('path');
        const { tmpdir } = await import('os');
        const { loadSessionResults, getPendingExtractionResults } = await import('../../src/deep/session.js');
        const root = mkdtempSync(join(tmpdir(), 'digdig-jina-search-'));
        const session = join(root, 'session');
        vi.stubEnv('JINA_API_KEY', 'test-key');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [{ title: 'Jina', url: 'https://example.com/a', content: 'Already fetched body' }] })));
        try {
            const envelope = await run(['q', '-e', 'jina', '--session', session, '--format', 'json'], stubSxng());
            expect(envelope.status).toBe('ok');
            expect(loadSessionResults(session)).toEqual(expect.arrayContaining([expect.objectContaining({ contentType: 'extracted', content: 'Already fetched body', extractor: 'jina' })]));
            expect(getPendingExtractionResults(session)).toHaveLength(0);
        } finally { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(root, { recursive: true, force: true }); }
    });

    it('lists configured providers even when SearXNG is unavailable', async () => {
        vi.stubEnv('EXA_API_KEY', 'test-key');
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        const previous = process.exitCode;
        try {
            await runCli(['--engines-list'], { getEngines: vi.fn().mockRejectedValue(new Error('offline')) } as never);
            const envelope = JSON.parse(output.mock.lastCall![0]);
            expect(envelope.status).toBe('ok');
            expect(envelope.data.sources.local).toContain('exa');
            expect(envelope.data.serverUnavailable).toBe(true);
        } finally { process.exitCode = previous; vi.unstubAllEnvs(); }
    });

    it('uses an authenticated installed Tavily CLI for a selected search', async () => {
        vi.stubEnv('TAVILY_API_KEY', '');
        installedTavily.ready.mockResolvedValue(true);
        installedTavily.search.mockResolvedValue(providerResponse('tavily', 'https://tavily.test'));
        const service = stubSxng();
        try {
            const envelope = await run(['q', '-e', 'tavily', '--format', 'json'], service);
            expect(envelope.status).toBe('ok');
            expect(installedTavily.search).toHaveBeenCalledWith('q', 10);
            expect(service.search).not.toHaveBeenCalled();
        } finally { vi.unstubAllEnvs(); }
    });

    it('selects the configured default engine when none is explicitly requested', async () => {
        config.defaultEngine = 'google';
        config.allowedEngines = ['google', 'bing'];
        const service = stubSxng();
        await run(['q', '--format', 'json'], service);
        expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ engines: ['google'] }));
    });

    it('uses the allowed engines when there is no default', async () => {
        config.allowedEngines = ['google', 'bing'];
        const service = stubSxng();
        await run(['q', '--format', 'json'], service);
        expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ engines: ['google', 'bing'] }));
    });

    it('rejects a default engine outside the allowlist before searching', async () => {
        config.defaultEngine = 'bing';
        config.allowedEngines = ['google'];
        const service = stubSxng();
        const envelope = await run(['q', '--format', 'json'], service);
        expect(envelope).toMatchObject({ status: 'error', error: { code: 'INVALID_ENGINES' } });
        expect(service.search).not.toHaveBeenCalled();
    });

    it('rejects an explicitly empty engine list instead of bypassing the allowlist', async () => {
        config.allowedEngines = ['google'];
        const service = stubSxng();
        const envelope = await run(['q', '-e', ',,', '--format', 'json'], service);
        expect(envelope).toMatchObject({ status: 'error', error: { code: 'INVALID_ENGINES' } });
        expect(service.search).not.toHaveBeenCalled();
    });

    it('lets an allowed explicit engine override the default', async () => {
        config.defaultEngine = 'google';
        config.allowedEngines = ['google', 'bing'];
        const service = stubSxng();
        await run(['q', '-e', 'bing', '--format', 'json'], service);
        expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ engines: ['bing'] }));
    });

    it('routes a configured default external provider without SearXNG', async () => {
        config.defaultEngine = 'deepseek';
        config.allowedEngines = ['deepseek'];
        config.deepseekApiKey = 'k';
        config.baseUrl = '';
        const service = stubSxng();
        await run(['q', '--format', 'json'], service);
        expect(deepseekSearch).toHaveBeenCalledTimes(1);
        expect(service.search).not.toHaveBeenCalled();
    });

    it('rejects a default provider without a key before creating a session', async () => {
        const { existsSync, mkdtempSync, rmSync } = await import('fs');
        const { join } = await import('path');
        const { tmpdir } = await import('os');
        const root = mkdtempSync(join(tmpdir(), 'digdig-default-provider-'));
        const session = join(root, 'session');
        config.defaultEngine = 'deepseek';
        const service = stubSxng();
        try {
            const envelope = await run(['q', '--session', session, '--format', 'json'], service);
            expect(envelope).toMatchObject({ status: 'error', error: { code: 'PROVIDER_NOT_CONFIGURED' } });
            expect(service.search).not.toHaveBeenCalled();
            expect(existsSync(session)).toBe(false);
        } finally { rmSync(root, { recursive: true, force: true }); }
    });

    it('keeps the backend default when neither engine setting is configured', async () => {
        const service = stubSxng();
        await run(['q', '--format', 'json'], service);
        expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ engines: [] }));
    });

    it('routes an allowed mixed provider list to each backend', async () => {
        config.allowedEngines = ['google', 'deepseek'];
        config.deepseekApiKey = 'k';
        const service = stubSxng();
        const envelope = await run(['q', '--format', 'json'], service);
        expect(envelope.status).toBe('ok');
        expect(deepseekSearch).toHaveBeenCalledTimes(1);
        expect(service.search).toHaveBeenCalledWith(expect.objectContaining({ engines: ['google'] }));
    });

    it('errors instead of silently falling back when a selected provider has no key', async () => {
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'deepseek', '--format', 'json'], service);

        expect(envelope.status).toBe('error');
        expect(envelope.error.code).toBe('PROVIDER_NOT_CONFIGURED');
        expect(envelope.error.message).toContain('deepseek');
        expect(service.search).not.toHaveBeenCalled();
        expect(deepseekSearch).not.toHaveBeenCalled();
    });

    it('does not touch a provider that was not selected, even with a key present', async () => {
        config.deepseekApiKey = 'k';
        const service = stubSxng();

        await run(['q', '-e', 'google', '--format', 'json'], service);

        expect(service.search).toHaveBeenCalledTimes(1);
        expect(deepseekSearch).not.toHaveBeenCalled();
    });

    it('routes -e deepseek to the provider alone, without also querying SearXNG', async () => {
        config.deepseekApiKey = 'k';
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'deepseek', '--format', 'json'], service);

        expect(deepseekSearch).toHaveBeenCalledWith({ query: 'q', limit: 10 });
        expect(service.search).not.toHaveBeenCalled();
        expect(envelope.data.results).toHaveLength(1);
        expect(envelope.data.results[0].engine).toBe('deepseek');
    });

    it('ranks merged provider and SearXNG results by fusion score, not by provider block', async () => {
        // AC5: the old merge flatMapped [providerResults, sxngResponse], so output
        // order was structural. Returning two provider hits against one SearXNG
        // hit makes block order and fusion order disagree, which the old code
        // could not distinguish and this test can.
        config.deepseekApiKey = 'k';
        deepseekSearch.mockResolvedValue({
            query: 'q',
            numberOfResults: 2,
            results: [
                { title: 'deepseek-a', url: 'https://provider-a.test', content: 'a', engine: 'deepseek', category: 'general' },
                { title: 'deepseek-b', url: 'https://provider-b.test', content: 'b', engine: 'deepseek', category: 'general' },
            ],
            suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [],
        });
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'deepseek,google', '--format', 'json'], service);

        const scores = envelope.data.results.map((r: any) => r.fusionScore);
        expect(scores.every((s: number) => s > 0)).toBe(true);
        // Descending fusion score, ties broken stably — never provider-block order.
        expect(scores).toEqual([...scores].sort((a: number, b: number) => b - a));
        // The discriminator against the old flatMap: the provider's second result
        // sat at position 2 of its own ranking, SearXNG's only result at position
        // 1 of its own. Block concatenation would put both provider hits first;
        // fusion puts SearXNG's ahead of the provider's second. (The provider's
        // first result and SearXNG's only one tie at 1/61, so their mutual order
        // is not asserted.)
        const order = envelope.data.results.map((r: any) => r.url);
        expect(order.indexOf('https://sxng.test')).toBeLessThan(order.indexOf('https://provider-b.test'));
        expect(order).toContain('https://provider-a.test');
    });

    it('merges DeepSeek and SearXNG results when both are selected', async () => {
        config.deepseekApiKey = 'k';
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'deepseek,google', '--format', 'json'], service);

        expect(deepseekSearch).toHaveBeenCalledTimes(1);
        expect(service.search).toHaveBeenCalledTimes(1);
        expect(envelope.data.results.map((r: any) => r.engine)).toEqual(['deepseek', 'google']);
        expect(envelope.data.totalResults).toBe(2);
        // SearXNG owns the envelope metadata when it participates.
        expect(envelope.data.query).toBe('q');
    });

    it('keeps the multi-query path from double-querying SearXNG for a provider-only search', async () => {
        // Regression guard: the old guard `sxngEngines.length > 0 || !useOllama`
        // ran SearXNG even when the selected provider fully covered the request.
        config.deepseekApiKey = 'k';
        const service = stubSxng();

        const envelope = await run(['--queries', 'a,b', '-e', 'deepseek', '--format', 'json'], service);

        expect(deepseekSearch).toHaveBeenCalledTimes(2);
        expect(service.search).not.toHaveBeenCalled();
        expect(envelope.status).toBe('ok');
    });

    it('attributes session origins to the provider that produced each result', async () => {
        const { mkdtempSync } = await import('fs');
        const { join } = await import('path');
        const { tmpdir } = await import('os');
        const { loadSessionResults } = await import('../../src/deep/session.js');
        config.deepseekApiKey = 'k';
        const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-routing-'));

        await run(['q', '-e', 'deepseek,google', '--session', sessionDir, '--format', 'json'], stubSxng());

        const tools = loadSessionResults(sessionDir)
            .flatMap(result => result.origins.map(origin => origin.tool))
            .sort();
        expect(tools).toEqual(['deepseek', 'digdig']);
    });

    it('says so when a requested limit exceeds the provider ceiling', async () => {
        config.ollamaApiKey = 'k';
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'ollama', '-l', '20', '--format', 'json'], service);

        expect(envelope.data.limitNotes).toEqual([{ provider: 'ollama', requested: 20, applied: 10 }]);
    });

    it('omits the note entirely when every provider can honour the limit', async () => {
        config.ollamaApiKey = 'k';
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'ollama', '-l', '5', '--format', 'json'], service);

        // Not an empty array: a request that was honoured in full keeps the
        // exact data shape it had before limitNotes existed.
        expect(envelope.data).not.toHaveProperty('limitNotes');
    });

    it('lists every provider that capped the same request', async () => {
        config.ollamaApiKey = 'k';
        config.deepseekApiKey = 'k';
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'ollama,deepseek', '-l', '80', '--format', 'json'], service);

        expect(envelope.data.limitNotes).toEqual([
            { provider: 'ollama', requested: 80, applied: 10 },
            { provider: 'deepseek', requested: 80, applied: 50 },
        ]);
    });

    it('renders the cap in markdown output too', async () => {
        config.ollamaApiKey = 'k';
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
        await runCli(['q', '-e', 'ollama', '-l', '20', '--format', 'md'], stubSxng() as never);
        const text = output.mock.calls.at(-1)![0] as string;
        output.mockRestore();

        expect(text).toContain('Limit capped: ollama (asked for 20, provider caps at 10)');
    });

    it('reports unconfigured providers before any search is attempted', async () => {
        config.ollamaApiKey = 'k';
        const service = stubSxng();

        const envelope = await run(['q', '-e', 'ollama,deepseek', '--format', 'json'], service);

        expect(envelope.status).toBe('error');
        expect(envelope.error.code).toBe('PROVIDER_NOT_CONFIGURED');
        expect(envelope.error.message).toContain('deepseek');
        expect(service.search).not.toHaveBeenCalled();
    });
});
