import { describe, expect, it, vi } from 'vitest';
vi.mock('dns/promises', () => ({ lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) }));
const cli = vi.hoisted(() => ({ status: vi.fn(), extract: vi.fn() }));
vi.mock('../../../src/deep/installed-firecrawl.js', () => ({ installedFirecrawlStatus: cli.status, installedFirecrawlExtract: cli.extract }));
import { ContentExtractor } from '../../../src/deep/extractor.js';

describe('authenticated CLI extraction', () => {
    it('uses the Firecrawl CLI before its visible API key', async () => {
        cli.status.mockResolvedValue('authenticated');
        cli.extract.mockResolvedValue({ title: '', url: 'https://example.com/page', content: 'CLI body', excerpt: 'CLI body', length: 8, extractedAt: 1, method: 'firecrawl' });
        const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 403 }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const result = await new ContentExtractor({ useInstalledFirecrawl: true, externalKeys: { firecrawl: 'fake-key' } }).extract('https://example.com/page');
            expect(result.content).toBe('CLI body');
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(cli.extract).toHaveBeenCalledOnce();
        } finally { vi.unstubAllGlobals(); }
    });
});
