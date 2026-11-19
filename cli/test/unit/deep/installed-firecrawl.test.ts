import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: execute }) }));
import { installedFirecrawlExtract, installedFirecrawlSearch, installedFirecrawlStatus } from '../../../src/deep/installed-firecrawl.js';

beforeEach(() => { vi.stubEnv('PATH', ''); execute.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
describe('installed Firecrawl CLI', () => {
    it('detects local authentication without issuing a search', async () => {
        execute.mockResolvedValueOnce({ stdout: 'Status: ✓ Authenticated\nAPI Key: fake...fake' }).mockResolvedValueOnce({ stdout: 'Status: Not authenticated' });
        expect(await installedFirecrawlStatus()).toBe('authenticated');
        expect(await installedFirecrawlStatus()).toBe('unavailable');
        expect(execute).toHaveBeenCalledWith('firecrawl', ['view-config'], expect.any(Object));
    });
    it('uses argument arrays and maps search results', async () => {
        execute.mockResolvedValueOnce({ stdout: JSON.stringify({ success: true, data: { web: [{ url: 'https://example.com', title: 'Title', description: 'Snippet' }] } }) });
        expect((await installedFirecrawlSearch('a & b', 10)).results[0]).toMatchObject({ engine: 'firecrawl', content: 'Snippet' });
        expect(execute).toHaveBeenCalledWith('firecrawl', ['search', 'a & b', '--limit', '10', '--no-domain-tools', '--json'], expect.any(Object));
    });
    it('extracts text without shell interpolation', async () => {
        execute.mockResolvedValueOnce({ stdout: JSON.stringify({ markdown: 'Page content', metadata: { statusCode: 200 } }) });
        expect(await installedFirecrawlExtract('https://example.com?a=1&b=2', 1000)).toMatchObject({ method: 'firecrawl', content: 'Page content' });
        expect(execute).toHaveBeenCalledWith('firecrawl', ['scrape', 'https://example.com?a=1&b=2', '--format', 'markdown', '--json'], expect.objectContaining({ timeout: 1000 }));
    });
    it('treats the official zero-result message as a successful empty search', async () => {
        execute.mockResolvedValueOnce({ stdout: 'No results found.\n' });
        expect((await installedFirecrawlSearch('q', 5)).results).toEqual([]);
    });
});
