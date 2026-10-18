import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { DeepSeekService } from '../../src/deepseek-service.js';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

type PostArgs = [string, unknown, { headers: Record<string, string> }];

function mockPost(responseData: unknown) {
    const post = vi.fn().mockResolvedValue({ data: responseData });
    mockedAxios.create.mockReturnValue({ post } as never);
    return post;
}

function mockPostReject(error: unknown) {
    const post = vi.fn().mockRejectedValue(error);
    mockedAxios.create.mockReturnValue({ post } as never);
    return post;
}

function axiosError(status: number, statusText: string) {
    const error = new Error(`Request failed with status code ${status}`) as Error & Record<string, unknown>;
    error.isAxiosError = true;
    error.response = { status, statusText };
    return error;
}

// A transport failure has no `response` — that absent field is what separates a
// timeout from an HTTP error in the adapter's two-branch error handling.
function axiosTransportError(message: string) {
    const error = new Error(message) as Error & Record<string, unknown>;
    error.isAxiosError = true;
    return error;
}

describe('DeepSeekService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // `axios.isAxiosError` is used by the adapter to tell transport failures
        // apart; restore the real implementation the module under test relies on.
        mockedAxios.isAxiosError.mockImplementation(
            (value: unknown) => (value as { isAxiosError?: boolean })?.isAxiosError === true,
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('maps summary into content, snippet into snippet, and preserves rank order', async () => {
        const post = mockPost({
            results: [
                { title: 'A', url: 'https://a.test', summary: 'long A', snippet: 'short A', date: '2026-06-01T00:00:00+00:00' },
                { title: 'B', url: 'https://b.test', summary: 'long B', snippet: 'short B' },
            ],
        });

        const response = await new DeepSeekService({ apiKey: 'k' }).search({ query: 'q' });

        expect(response.results).toHaveLength(2);
        expect(response.results[0]).toMatchObject({
            title: 'A',
            url: 'https://a.test',
            // The two slots are distinct on purpose: `content` is the body-text
            // sample the analysis layer reads, `snippet` only the display blurb.
            content: 'long A',
            snippet: 'short A',
            engine: 'deepseek',
            category: 'general',
            rank: 1,
            publishedDate: '2026-06-01T00:00:00+00:00',
        });
        expect(response.results[1]!.rank).toBe(2);
        expect(response.numberOfResults).toBe(2);
        expect(response.suggestions).toEqual([]);
        expect(response.query).toBe('q');

        const [, body, config] = post.mock.calls[0] as PostArgs;
        expect(body).toEqual({ query: 'q', count: 10 });
        expect(config.headers.Authorization).toBe('Bearer k');
    });

    it('falls back to snippet when summary is absent, and to empty string when both are', async () => {
        mockPost({
            results: [
                { title: 'A', url: 'https://a.test', snippet: 'short A' },
                { title: 'B', url: 'https://b.test' },
            ],
        });

        const response = await new DeepSeekService({ apiKey: 'k' }).search({ query: 'q' });

        expect(response.results[0]!.content).toBe('short A');
        expect(response.results[0]!.snippet).toBe('short A');
        expect(response.results[1]!.content).toBe('');
        // No snippet is `undefined`, not the empty string: the display layer's
        // fallback chain tests for presence, and '' would win the `??` race.
        expect(response.results[1]!.snippet).toBeUndefined();
    });

    it('normalizes a null date to undefined', async () => {
        mockPost({ results: [{ title: 'A', url: 'https://a.test', summary: 's', date: null }] });

        const response = await new DeepSeekService({ apiKey: 'k' }).search({ query: 'q' });

        expect(response.results[0]!.publishedDate).toBeUndefined();
    });

    it('clamps count to the documented 50-result ceiling and defaults limit to 10', async () => {
        const post = mockPost({ results: [] });

        await new DeepSeekService({ apiKey: 'k' }).search({ query: 'q', limit: 500 });
        expect((post.mock.calls[0] as PostArgs)[1]).toEqual({ query: 'q', count: 50 });

        await new DeepSeekService({ apiKey: 'k' }).search({ query: 'q' });
        expect((post.mock.calls[1] as PostArgs)[1]).toEqual({ query: 'q', count: 10 });
    });

    it('passes the query through untruncated', async () => {
        const post = mockPost({ results: [] });
        const longQuery = 'x'.repeat(200);

        await new DeepSeekService({ apiKey: 'k' }).search({ query: longQuery });

        expect((post.mock.calls[0] as PostArgs)[1]).toEqual({ query: longQuery, count: 10 });
    });

    it('throws on a non-2xx response, naming the status', async () => {
        mockPostReject(axiosError(429, 'Too Many Requests'));

        await expect(new DeepSeekService({ apiKey: 'k' }).search({ query: 'q' }))
            .rejects.toThrow('DeepSeek search failed: HTTP 429 Too Many Requests');
    });

    it('throws on a transport failure', async () => {
        mockPostReject(axiosTransportError('timeout of 15000ms exceeded'));

        await expect(new DeepSeekService({ apiKey: 'k' }).search({ query: 'q' }))
            .rejects.toThrow('DeepSeek search failed: timeout of 15000ms exceeded');
    });

    it('throws when the response body has no results array', async () => {
        mockPost({});

        await expect(new DeepSeekService({ apiKey: 'k' }).search({ query: 'q' }))
            .rejects.toThrow('DeepSeek search returned an unexpected response body');
    });
});
