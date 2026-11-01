/**
 * What the CLI actually prints when a provider fails.
 *
 * The unit tests in `search-errors.test.ts` and `deepseek-service.test.ts` pin
 * the classification itself. This file pins the envelope, because that is what
 * a caller reads — and because reverting the `runSearch` catch while leaving
 * the providers intact still passes every provider-level test. Measured
 * 2026-10-31: removing the `error instanceof SearchError` branch left all 12
 * DeepSeek tests green. A test that cannot tell the catch was reverted is not
 * guarding the catch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
import { SearchError } from '../../src/errors.js';

const originalKeys = { ollama: config.ollamaApiKey, deepseek: config.deepseekApiKey };

/** Run the CLI and return the envelope it printed. */
async function envelopeFor(search: ReturnType<typeof vi.fn>) {
    search.mockRejectedValueOnce(new SearchError('AUTH_FAILED', 'boom', 'deepseek', 401));

    const printed: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
        printed.push(String(line));
    });

    const code = await runCli(['q', '-e', 'deepseek', '--format', 'json'], { search } as never);

    log.mockRestore();
    return { code, envelope: JSON.parse(printed.join('')) };
}

describe('runSearch failure envelope', () => {
    beforeEach(() => {
        config.deepseekApiKey = 'k';
        config.ollamaApiKey = '';
        vi.clearAllMocks();
    });

    afterEach(() => {
        config.deepseekApiKey = originalKeys.deepseek;
        config.ollamaApiKey = originalKeys.ollama;
        vi.restoreAllMocks();
    });

    it('does not report an auth failure as retryable', async () => {
        const { envelope } = await envelopeFor(deepseekSearch);

        expect(envelope.status).toBe('error');
        expect(envelope.error.retryable).toBe(false);
    });

    it('does not blame SearXNG for a DeepSeek failure', async () => {
        const { envelope } = await envelopeFor(deepseekSearch);

        expect(envelope.hint).toContain('DEEPSEEK_API_KEY');
        expect(envelope.hint).not.toContain('SearXNG');
    });

    it('surfaces the classified code instead of a blanket SEARCH_FAILED', async () => {
        const { envelope } = await envelopeFor(deepseekSearch);

        expect(envelope.error.code).toBe('AUTH_FAILED');
        expect(envelope.error.details).toMatchObject({ provider: 'deepseek', status: 401 });
    });

    it('sets a failing exit code', async () => {
        // `runCli` returns null on the commander path — the subcommand sets
        // `process.exitCode` itself — so the assertion reads what it actually
        // wrote rather than the return value.
        process.exitCode = undefined;
        await envelopeFor(deepseekSearch);

        expect(process.exitCode).toBe(1);
        process.exitCode = undefined;
    });

    it('keeps the message the provider produced', async () => {
        const { envelope } = await envelopeFor(deepseekSearch);

        expect(envelope.error.message).toBe('boom');
    });
});
