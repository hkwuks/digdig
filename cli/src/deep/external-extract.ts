import type { ExtractedContent } from './extractor.js';

export type ExternalProvider = 'exa' | 'tavily' | 'firecrawl' | 'ollama' | 'deepseek';
export type ExternalKeys = Partial<Record<ExternalProvider, string>>;

const endpoints: Record<ExternalProvider, string> = {
    exa: 'https://api.exa.ai/contents',
    tavily: 'https://api.tavily.com/extract',
    firecrawl: 'https://api.firecrawl.dev/v2/scrape',
    ollama: 'https://ollama.com/api/web_fetch',
    deepseek: 'https://api.deepseek.com/v1/tools/fetch',
};

export async function externalExtract(provider: ExternalProvider, key: string, url: string, timeoutMs: number): Promise<ExtractedContent | string> {
    try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return 'invalid URL';
    } catch { return 'invalid URL'; }
    const body = provider === 'exa' ? { urls: [url], text: true }
        : provider === 'tavily' ? { urls: [url], extract_depth: 'basic', format: 'markdown' }
        : provider === 'firecrawl' ? { url, formats: ['markdown'] }
        : { url };
    try {
        const response = await fetch(endpoints[provider], {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(provider === 'exa' ? { 'x-api-key': key } : { Authorization: `Bearer ${key}` }) },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return `HTTP ${response.status}`;
        const data = await response.json() as any;
        if (provider === 'firecrawl' && (data.success === false || (typeof data.data?.metadata?.statusCode === 'number' && ![200, 201, 202, 203, 204, 205, 206, 304].includes(data.data.metadata.statusCode)))) return 'target page failed';
        const item = provider === 'exa' || provider === 'tavily' ? data.results?.[0]
            : provider === 'firecrawl' ? data.data : data;
        const content = provider === 'exa' ? item?.text : provider === 'tavily' ? item?.raw_content
            : provider === 'firecrawl' ? item?.markdown : item?.content;
        if (typeof content !== 'string' || !content.trim()) return 'empty or invalid response';
        return {
            title: typeof item?.title === 'string' ? item.title : typeof item?.metadata?.title === 'string' ? item.metadata.title : '',
            content, excerpt: content.slice(0, 200), url, length: content.length,
            extractedAt: Date.now(), method: provider,
        };
    } catch {
        return 'network or timeout error';
    }
}

export function supportsType(provider: ExternalProvider, type: string): boolean {
    if (!type || type === 'text/html' || type === 'application/xhtml+xml' || type === 'text/plain') return true;
    if (type === 'application/pdf') return provider === 'exa' || provider === 'firecrawl';
    if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return provider === 'firecrawl';
    return false;
}
