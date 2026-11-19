import { describe, expect, it, vi } from 'vitest';
import { externalSearch } from '../../src/external-search.js';

describe('external search providers', () => {
    it.each([
        ['exa', { results: [{ title: 'Title', url: 'https://example.com', text: 'body' }] }, 'https://api.exa.ai/search', ''],
        ['tavily', { results: [{ title: 'Title', url: 'https://example.com', content: 'snippet' }] }, 'https://api.tavily.com/search', 'snippet'],
        ['firecrawl', { success: true, data: { web: [{ title: 'Title', url: 'https://example.com', description: 'snippet' }] } }, 'https://api.firecrawl.dev/v2/search', 'snippet'],
    ] as const)('%s maps search results and does not invent a full body', async (provider, payload, endpoint, snippet) => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json(payload));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await externalSearch(provider, 'test-key', 'query', 10);
            expect(fetchMock.mock.calls[0][0]).toBe(endpoint);
            expect(result.results[0]).toMatchObject({ engine: provider, content: snippet, url: 'https://example.com' });
        } finally { vi.unstubAllGlobals(); }
    });

    it('caps Tavily result requests to its documented maximum', async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [] }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            await externalSearch('tavily', 'key', 'query', 50);
            expect(JSON.parse(fetchMock.mock.calls[0][1].body).max_results).toBe(20);
        } finally { vi.unstubAllGlobals(); }
    });

    it('classifies auth errors without exposing the API key', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
        try {
            await expect(externalSearch('exa', 'secret-key', 'query', 10)).rejects.toMatchObject({ code: 'AUTH_FAILED', provider: 'exa' });
        } finally { vi.unstubAllGlobals(); }
    });
    it('marks Jina search content as completeness unverified', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ data: [{ title: 'Page', url: 'https://example.com', content: 'body' }] })));
        try {
            const result = await externalSearch('jina', 'key', 'query', 1);
            expect(result.results[0]).toMatchObject({ contentCompleteness: 'unverified' });
        } finally { vi.unstubAllGlobals(); }
    });

});
