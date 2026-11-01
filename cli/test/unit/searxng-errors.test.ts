/**
 * The SearXNG adapter's two error branches.
 *
 * This exists because the transport branch cannot be reached end to end on this
 * machine: every outbound request goes through a proxy, so an unreachable
 * hostname comes back as HTTP 502 rather than a DNS/socket failure. That is a
 * property of the environment, not of the code, so the branch is pinned here
 * instead of in a live probe.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

function axiosError(status: number, statusText: string) {
    const error = new Error(`Request failed with status code ${status}`) as Error & Record<string, unknown>;
    error.isAxiosError = true;
    error.response = { status, statusText };
    return error;
}

function axiosTransportError(message: string) {
    const error = new Error(message) as Error & Record<string, unknown>;
    error.isAxiosError = true;
    // No `response` — that absence is what separates a transport failure from
    // an HTTP error in the adapter's two-branch handling.
    return error;
}

describe('SearXNGService error classification', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedAxios.isAxiosError.mockImplementation(
            (value: unknown) => (value as { isAxiosError?: boolean })?.isAxiosError === true,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function failure(error: unknown) {
        const get = vi.fn().mockRejectedValue(error);
        mockedAxios.create.mockReturnValue({ get } as never);
        const { SearXNGService } = await import('../../src/service.js');
        return new SearXNGService().search({ query: 'q' } as never).catch(e => e);
    }

    it('classifies a response-less failure as NETWORK_ERROR and retryable', async () => {
        const error = await failure(axiosTransportError('getaddrinfo ENOTFOUND'));

        expect(error.name).toBe('SearchError');
        expect(error.code).toBe('NETWORK_ERROR');
        expect(error.retryable).toBe(true);
        expect(error.status).toBeUndefined();
        // SearXNG is the one provider whose hint may name SearXNG.
        expect(error.hint).toContain('SearXNG');
    });

    it('classifies 401 as AUTH_FAILED and not retryable', async () => {
        const error = await failure(axiosError(401, 'Unauthorized'));

        expect(error.code).toBe('AUTH_FAILED');
        expect(error.retryable).toBe(false);
        expect(error.status).toBe(401);
    });

    it('classifies 429 as RATE_LIMITED and retryable', async () => {
        const error = await failure(axiosError(429, 'Too Many Requests'));

        expect(error.code).toBe('RATE_LIMITED');
        expect(error.retryable).toBe(true);
    });

    it('classifies 5xx as SERVER_ERROR and retryable', async () => {
        const error = await failure(axiosError(502, 'Bad Gateway'));

        expect(error.code).toBe('SERVER_ERROR');
        expect(error.retryable).toBe(true);
    });

    it('keeps the message the adapter already produced', async () => {
        const error = await failure(axiosError(500, 'Internal Server Error'));

        expect(error.message).toBe('Search failed: Internal Server Error');
    });
});
