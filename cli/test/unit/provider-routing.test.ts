import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The router constructs providers internally from the shared config, so the two
// provider modules are mocked to observe which ones actually ran — no API key
// and no network are needed to exercise the routing and merge logic.
const deepseekSearch = vi.fn();
const ollamaSearch = vi.fn();

vi.mock('../../src/deepseek-service.js', () => ({
    DeepSeekService: class {
        constructor(readonly opts: { apiKey: string }) {}
        search = deepseekSearch;
    },
}));

vi.mock('../../src/ollama-service.js', () => ({
    OllamaService: class {
        constructor(readonly opts: { apiKey: string }) {}
        search = ollamaSearch;
    },
}));

import { runCli } from '../../src/runCli.js';
import { config } from '../../src/config.js';

const originalKeys = { ollama: config.ollamaApiKey, deepseek: config.deepseekApiKey };

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
        deepseekSearch.mockResolvedValue(providerResponse('deepseek', 'https://deepseek.test'));
        ollamaSearch.mockResolvedValue(providerResponse('ollama', 'https://ollama.test'));
    });

    afterEach(() => {
        config.ollamaApiKey = originalKeys.ollama;
        config.deepseekApiKey = originalKeys.deepseek;
        vi.restoreAllMocks();
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
        expect(tools).toEqual(['deepseek', 'sxng']);
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
