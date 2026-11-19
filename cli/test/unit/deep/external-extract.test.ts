import { lookup } from 'dns/promises';
vi.mock('dns/promises', () => ({ lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) }));
import { describe, expect, it, vi } from 'vitest';
import { ContentExtractor } from '../../../src/deep/extractor.js';

describe('configured extraction providers', () => {
    it.each([
        ['exa', { results: [{ text: 'Exa body' }] }, 'https://api.exa.ai/contents'],
        ['tavily', { results: [{ raw_content: 'Tavily body' }] }, 'https://api.tavily.com/extract'],
        ['firecrawl', { data: { markdown: 'Firecrawl body' } }, 'https://api.firecrawl.dev/v2/scrape'],
        ['ollama', { content: 'Ollama body' }, 'https://ollama.com/api/web_fetch'],
        ['deepseek', { content: 'DeepSeek body' }, 'https://api.deepseek.com/v1/tools/fetch'],
    ] as const)('uses %s only after the local HTML fetch fails', async (provider, payload, endpoint) => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }))
            .mockResolvedValueOnce(Response.json(payload));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ externalKeys: { [provider]: 'test-key' } }).extract('https://example.com/page');
            expect(result.method).toBe(provider);
            expect(result.content).toContain('body');
            expect(fetchMock.mock.calls[1][0]).toBe(endpoint);
        } finally { vi.unstubAllGlobals(); }
    });

    it('routes PDF only to providers with documented PDF support', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('pdf', { headers: { 'content-type': 'application/pdf' } }))
            .mockResolvedValueOnce(Response.json({ data: { markdown: 'PDF body' } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ externalKeys: { tavily: 'key', firecrawl: 'key', deepseek: 'key' } }).extract('https://example.com/doc');
            expect(result.method).toBe('firecrawl');
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally { vi.unstubAllGlobals(); }
    });

    it('does not call configured providers when a local body is sufficient', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(`<article><p>${'a'.repeat(150)}</p></article>`, { headers: { 'content-type': 'text/html' } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            expect((await new ContentExtractor({ externalKeys: { exa: 'key' } }).extract('https://example.com')).method).toBe('defuddle');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally { vi.unstubAllGlobals(); }
    });
    it('preserves the provider HTTP failure without exposing the key', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }))
            .mockResolvedValueOnce(new Response('', { status: 429 }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ externalKeys: { exa: 'secret-test-key' } }).extract('https://example.com/page');
            expect(result.error).toContain('exa: HTTP 429');
            expect(result.error).not.toContain('secret-test-key');
        } finally { vi.unstubAllGlobals(); }
    });

    it('does not accept a Firecrawl error page as extracted content', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }))
            .mockResolvedValueOnce(Response.json({ success: true, data: { markdown: 'Access denied', metadata: { statusCode: 403 } } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ externalKeys: { firecrawl: 'test-key' } }).extract('https://example.com/page');
            expect(result.content).toBe('');
            expect(result.error).toContain('firecrawl: target page failed');
        } finally { vi.unstubAllGlobals(); }
    });

    it('does not purchase another extraction for a valid short local body', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('<article><p>Short body</p></article>', { headers: { 'content-type': 'text/html' } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ externalKeys: { exa: 'key' } }).extract('https://example.com');
            expect(result.content).toBe('Short body');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally { vi.unstubAllGlobals(); }
    });

    it('uses configured Jina for PDF and sends its configured authorization', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('pdf', { headers: { 'content-type': 'application/pdf' } }))
            .mockResolvedValueOnce(new Response('Jina PDF body'));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ jinaApiKey: 'jina-test-key' }).extract('https://example.com/doc');
            expect(result.method).toBe('jina');
            expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer jina-test-key');
        } finally { vi.unstubAllGlobals(); }
    });

    it.each(['http://localhost/private', 'http://192.168.1.4/a', 'http://[::1]/a', 'https://user:password@example.com/a'])('never forwards private or authenticated URL %s to providers', async (url) => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            await new ContentExtractor({ externalKeys: { exa: 'key' }, jinaApiKey: 'key' }).extract(url);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally { vi.unstubAllGlobals(); }
    });

    it('does not forward a hostname that resolves to a private address', async () => {
        vi.mocked(lookup).mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }] as never);
        const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            await new ContentExtractor({ externalKeys: { exa: 'key' } }).extract('https://private.example.com/document');
            expect(fetchMock).toHaveBeenCalledTimes(1);
        } finally { vi.unstubAllGlobals(); }
    });

    it('routes a DOCX response to a documented document provider only', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('docx', { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } }))
            .mockResolvedValueOnce(Response.json({ success: true, data: { markdown: 'Document body', metadata: { statusCode: 200 } } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ externalKeys: { exa: 'key', firecrawl: 'key' } }).extract('https://example.com/document');
            expect(result.method).toBe('firecrawl');
            expect(fetchMock.mock.calls[1][0]).toBe('https://api.firecrawl.dev/v2/scrape');
            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally { vi.unstubAllGlobals(); }
    });

    it('handles a Tavily per-URL failure before trying another compatible provider', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 403 }))
            .mockResolvedValueOnce(Response.json({ results: [], failed_results: [{ url: 'https://example.com/a', error: 'failed' }] }))
            .mockResolvedValueOnce(Response.json({ success: true, data: { markdown: 'Recovered body' } }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ externalKeys: { tavily: 'key', firecrawl: 'key' } }).extract('https://example.com/a');
            expect(result).toMatchObject({ method: 'firecrawl', content: 'Recovered body' });
            expect(fetchMock).toHaveBeenCalledTimes(3);
        } finally { vi.unstubAllGlobals(); }
    });

});
