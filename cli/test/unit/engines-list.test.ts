/**
 * `--engines-list` when the server cannot be reached.
 *
 * The defect: `getEngines()` caught its own failure and returned `[]`, which a
 * caller cannot tell apart from "the server listed no engines". Combined with
 * `&&` and a hardcoded `source: 'server'`, a dead server with one configured
 * provider produced `status: "ok"`, `source: "server"`, and exit 0.
 *
 * The provider-level tests matter here: the failure was only observable when a
 * provider was configured, so a test with no provider would pass on the broken
 * code.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('axios');

const mockedAxios = vi.mocked((await import('axios')).default, true);

function axiosError(status: number, statusText: string) {
    const error = new Error(`Request failed with status code ${status}`) as Error & Record<string, unknown>;
    error.isAxiosError = true;
    error.response = { status, statusText };
    return error;
}

function stubClient(config: unknown, failure?: unknown) {
    const get = failure
        ? vi.fn().mockRejectedValue(failure)
        : vi.fn().mockResolvedValue({ data: config });
    mockedAxios.create.mockReturnValue({ get } as never);
    return get;
}

const SERVER_CONFIG = {
    engines: [
        { name: 'google', enabled: true },
        { name: 'bing', enabled: true },
        { name: 'disabled-one', enabled: false },
    ],
    categories: ['general', 'images'],
};

describe('SearXNGService failure propagation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedAxios.isAxiosError.mockImplementation(
            (value: unknown) => (value as { isAxiosError?: boolean })?.isAxiosError === true,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('rejects rather than resolving an empty list when the server fails', async () => {
        stubClient(undefined, axiosError(502, 'Bad Gateway'));
        const { SearXNGService } = await import('../../src/service.js');

        await expect(new SearXNGService().getEngines()).rejects.toThrow();
    });

    it('getCategories propagates too', async () => {
        stubClient(undefined, axiosError(502, 'Bad Gateway'));
        const { SearXNGService } = await import('../../src/service.js');

        await expect(new SearXNGService().getCategories()).rejects.toThrow();
    });

    it('still resolves the enabled engines when the server answers', async () => {
        stubClient(SERVER_CONFIG);
        const { SearXNGService } = await import('../../src/service.js');

        await expect(new SearXNGService().getEngines()).resolves.toEqual(['google', 'bing']);
    });

    it('resolves an empty list when the server genuinely has no enabled engines', async () => {
        // The distinction the old code erased: an empty answer is not a failure.
        stubClient({ engines: [{ name: 'off', enabled: false }], categories: [] });
        const { SearXNGService } = await import('../../src/service.js');

        await expect(new SearXNGService().getEngines()).resolves.toEqual([]);
    });
});
