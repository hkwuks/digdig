import { SearchError, searchErrorFromStatus } from './errors.js';
import type { SearchResponse } from './service.js';

type Provider = 'exa' | 'tavily' | 'firecrawl' | 'jina';
const endpoints: Record<Provider, string> = {
    exa: 'https://api.exa.ai/search', tavily: 'https://api.tavily.com/search', firecrawl: 'https://api.firecrawl.dev/v2/search', jina: 'https://s.jina.ai/',
};
const limits: Record<Provider, number> = { exa: 100, tavily: 20, firecrawl: 100, jina: 5 };

export async function externalSearch(provider: Provider, apiKey: string, query: string, limit: number): Promise<SearchResponse> {
    const count = Math.min(limit, limits[provider]);
    const body = provider === 'exa' ? { query, numResults: count, type: 'auto' }
        : provider === 'tavily' ? { query, max_results: count, search_depth: 'basic' }
        : { query, limit: count };
    let response: Response;
    try {
        response = await fetch(provider === 'jina' ? `${endpoints.jina}?q=${encodeURIComponent(query)}` : endpoints[provider], {
            method: provider === 'jina' ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(provider === 'exa' ? { 'x-api-key': apiKey } : { Authorization: `Bearer ${apiKey}` }) },
            ...(provider === 'jina' ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
        });
    } catch {
        throw new SearchError('NETWORK_ERROR', `${provider} search failed: network or timeout error`, provider);
    }
    if (!response.ok) throw searchErrorFromStatus(provider, response.status, `${provider} search failed: HTTP ${response.status}`);
    let data: any;
    try { data = await response.json(); }
    catch { throw new SearchError('BAD_RESPONSE', `${provider} search returned invalid JSON`, provider); }
    const raw = provider === 'firecrawl' ? data?.data?.web : provider === 'jina' ? data?.data : data?.results;
    if (!Array.isArray(raw) || (provider === 'firecrawl' && data.success === false)) {
        throw new SearchError('BAD_RESPONSE', `${provider} search returned an unexpected response`, provider);
    }
    const retrievedAt = Date.now();
    const results = raw.slice(0, count).filter(item => typeof item?.url === 'string' && item.url).map((item, index) => ({
        title: typeof item.title === 'string' ? item.title : '', url: item.url,
        content: provider === 'tavily' ? item.content ?? '' : provider === 'firecrawl' ? item.description ?? '' : provider === 'jina' && typeof item.content === 'string' ? item.content : '',
        ...(provider === 'jina' && typeof item.content === 'string' && item.content.trim() ? { contentType: 'extracted' as const, extractor: 'jina', extractedAt: retrievedAt } : {}),
        engine: provider, category: 'general', retrievedAt, rank: index + 1,
    }));
    return { query, numberOfResults: results.length, results, suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [] };
}
