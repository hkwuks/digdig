import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runExtract } from '../../../src/commands/extract.js';
import { ContentExtractor } from '../../../src/deep/extractor.js';
import { appendSessionResults, getPendingExtractionResults, initSessionDir, loadSessionResults, recordExtractionOutcome } from '../../../src/deep/session.js';

describe('runExtract', () => {
  const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-extract-'));
  afterEach(() => { vi.restoreAllMocks(); rmSync(sessionDir, { recursive: true, force: true }); });

  it('records the actual method, preserves a blank excerpt and measures the body', async () => {
    initSessionDir(sessionDir);
    const url = 'https://example.com/provenance';
    appendSessionResults(sessionDir, [{ url, title: 'Article', excerpt: 'Search summary', origins: [{ tool: 'sxng', query: 'q' }] }]);
    const extractor = { extractBatch: vi.fn().mockResolvedValue([{ url, title: 'Article', content: '正文😀', excerpt: '  ', length: 1, extractedAt: 1, method: 'defuddle' }]) } as any;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { session: sessionDir, urls: [url], obscura: true })).toBe(0);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({ extractor: 'defuddle', excerpt: 'Search summary', contentLength: '正文😀'.length });
  });

  it('runs a real short extraction through the command and SQLite', async () => {
    initSessionDir(sessionDir);
    const url = 'https://example.com/real-short';
    appendSessionResults(sessionDir, [{ url, title: 'Article', excerpt: 'Old summary', origins: [{ tool: 'sxng', query: 'q' }] }]);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body><p>短正文 😀</p></body></html>')));
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(await runExtract(new ContentExtractor(), { session: sessionDir, urls: [url] })).toBe(0);
      expect(JSON.parse(log.mock.lastCall![0])).toMatchObject({ status: 'ok', data: { extracted: [{ method: 'defuddle', content: '短正文 😀', length: '短正文 😀'.length }] } });
      expect(loadSessionResults(sessionDir)[0]).toMatchObject({ extractor: 'defuddle', excerpt: 'Old summary', contentLength: '短正文 😀'.length });
    } finally { vi.unstubAllGlobals(); }
  });

  it('updates a nonblank excerpt and uses the imported body length', () => {
    initSessionDir(sessionDir);
    const url = 'https://example.com/import';
    appendSessionResults(sessionDir, [{ url, title: 'Article', excerpt: 'Old', origins: [{ tool: 'sxng', query: 'q' }] }]);
    appendSessionResults(sessionDir, [{ url, title: 'Article', contentType: 'extracted', content: '新😀', excerpt: 'New' }]);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({ excerpt: 'New', contentLength: '新😀'.length });
    recordExtractionOutcome(sessionDir, [{ url, content: '更新😀', excerpt: '  Newer  ', length: 1 }]);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({ excerpt: '  Newer  ', contentLength: '更新😀'.length });
  });

  it.each(['jina', 'obscura'] as const)('persists the actual %s method', async (method) => {
    initSessionDir(sessionDir);
    const url = `https://example.com/${method}`;
    appendSessionResults(sessionDir, [{ url, title: 'Article', origins: [{ tool: 'sxng', query: 'q' }] }]);
    const extractor = { extractBatch: vi.fn().mockResolvedValue([{ url, title: 'Article', content: 'Body', excerpt: '', length: 4, extractedAt: 1, method }]) } as any;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { session: sessionDir, urls: [url] })).toBe(0);
    expect(loadSessionResults(sessionDir)[0].extractor).toBe(method);
  });

  it('requires explicit URLs for rate-limited special extractors', async () => {
    const extractor = { extractBatch: vi.fn() } as any;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { jina: true, session: 'named' })).toBe(1);
    expect(JSON.parse(log.mock.calls[0][0]).error.code).toBe('SPECIAL_EXTRACTOR_REQUIRES_URLS');
    expect(extractor.extractBatch).not.toHaveBeenCalled();
  });

  it('convenience mode extracts only pending discovery records and treats short nonempty content as success', async () => {
    initSessionDir(sessionDir);
    appendSessionResults(sessionDir, [
      { url: 'https://example.com/pending', title: 'Pending', origins: [{ tool: 'sxng', query: 'q' }] },
      { url: 'https://example.com/done', title: 'Done', contentType: 'extracted', content: 'Already present.', extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'q' }] },
    ]);
    const extractor = { extractBatch: vi.fn().mockResolvedValue([{
      url: 'https://example.com/pending', title: 'Pending', content: 'Short.', excerpt: '', length: 6, extractedAt: 1,
    }]) } as any;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { session: sessionDir })).toBe(0);
    expect(extractor.extractBatch).toHaveBeenCalledWith(['https://example.com/pending']);
    expect(loadSessionResults(sessionDir).find(result => result.url.endsWith('/pending'))).toMatchObject({ content: 'Short.', contentType: 'extracted' });
  });

  it('returns a retryable error with the Jina retry schedule', async () => {
    const extractor = { extractBatch: vi.fn().mockResolvedValue([{
      url: 'https://example.com/article', title: '', content: '', excerpt: '', length: 0, extractedAt: 1,
      error: 'Jina Reader rate limit reached', retryAfterMs: 3000, retryAt: 4000,
    }]) } as any;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runExtract(extractor, { urls: ['https://example.com/article'], jina: true })).toBe(1);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      status: 'error', error: { code: 'JINA_RATE_LIMITED', retryable: true, details: { retryAfterMs: 3000, retryAt: 4000 } },
    });
  });

  it('reports a nonzero structured error when every extraction fails', async () => {
    initSessionDir(sessionDir);
    const url = 'https://example.com/fail';
    appendSessionResults(sessionDir, [{ url, title: 'Fail', origins: [{ tool: 'sxng', query: 'q' }] }]);
    const extractor = { extractBatch: vi.fn().mockResolvedValue([{ url, title: '', content: '', excerpt: '', length: 0, extractedAt: 1, error: 'unavailable' }]) } as any;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { session: sessionDir, urls: [url] })).toBe(1);
    expect(JSON.parse(log.mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'EXTRACT_FAILED', details: { failed: [url], stats: { total: 1, success: 0, failed: 1 } } } });
    expect(loadSessionResults(sessionDir)[0].failureCount).toBe(1);
  });

  it('keeps successful results and retry details when a batch is partly rate limited', async () => {
    const urls = ['https://example.com/ok', 'https://example.com/limited'];
    initSessionDir(sessionDir);
    appendSessionResults(sessionDir, urls.map(url => ({ url, title: url, origins: [{ tool: 'sxng', query: 'q' }] })));
    const extractor = { extractBatch: vi.fn().mockResolvedValue([
      { url: urls[0], title: 'Ok', content: 'Body', excerpt: '', length: 4, extractedAt: 1 },
      { url: urls[1], title: '', content: '', excerpt: '', length: 0, extractedAt: 1, error: 'Jina Reader rate limit reached', retryAfterMs: 3000, retryAt: 4000 },
    ]) } as any;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { urls, jina: true, session: sessionDir })).toBe(0);
    expect(JSON.parse(log.mock.lastCall![0])).toMatchObject({ status: 'ok', data: { failed: [urls[1]], stats: { total: 2, success: 1, failed: 1 }, rateLimit: { retryAfterMs: 3000, retryAt: 4000 } } });
    const results = loadSessionResults(sessionDir);
    expect(results.find(result => result.url === urls[0])).toMatchObject({ content: 'Body', contentType: 'extracted' });
    expect(results.find(result => result.url === urls[1])?.failureCount).toBeUndefined();
  });

  it('succeeds with a failure list when a batch has ordinary partial failures', async () => {
    const urls = ['https://example.com/ok', 'https://example.com/fail'];
    const extractor = { extractBatch: vi.fn().mockResolvedValue([
      { url: urls[0], title: 'Ok', content: 'Body', excerpt: '', length: 4, extractedAt: 1 },
      { url: urls[1], title: '', content: '', excerpt: '', length: 0, extractedAt: 1, error: 'unavailable' },
    ]) } as any;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { urls })).toBe(0);
    expect(JSON.parse(log.mock.lastCall![0])).toMatchObject({ status: 'ok', data: { failed: [urls[1]], stats: { total: 2, success: 1, failed: 1 } } });
  });

  it('treats an empty extractor response for requested URLs as failure', async () => {
    const url = 'https://example.com/missing';
    const extractor = { extractBatch: vi.fn().mockResolvedValue([]) } as any;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(await runExtract(extractor, { urls: [url] })).toBe(1);
    expect(JSON.parse(log.mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'EXTRACT_FAILED', details: { failed: [url] } } });
  });

  it('keeps session results eligible after repeated Jina rate limits', async () => {
    initSessionDir(sessionDir);
    const url = 'https://example.com/limited';
    appendSessionResults(sessionDir, [{ url, title: 'Limited', origins: [{ tool: 'sxng', query: 'q' }] }]);
    const extractor = { extractBatch: vi.fn().mockResolvedValue([{
      url, title: '', content: '', excerpt: '', length: 0, extractedAt: 1,
      error: 'Jina Reader rate limit reached', retryAfterMs: 3000, retryAt: 4000,
    }]) } as any;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runExtract(extractor, { session: sessionDir, urls: [url], jina: true })).toBe(1);
    expect(await runExtract(extractor, { session: sessionDir, urls: [url], jina: true })).toBe(1);
    expect(loadSessionResults(sessionDir)[0].failureCount).toBeUndefined();
    expect(getPendingExtractionResults(sessionDir).map(result => result.url)).toContain(url);
    recordExtractionOutcome(sessionDir, [{ url, failure: { code: 'empty', message: 'blank' } }]);
    expect(loadSessionResults(sessionDir)[0].failureCount).toBe(1);
    expect(await runExtract(extractor, { session: sessionDir, urls: [url], jina: true })).toBe(1);
    expect(loadSessionResults(sessionDir)[0].failureCount).toBe(1);
    recordExtractionOutcome(sessionDir, [{ url, failure: { code: 'empty', message: 'blank' } }]);
    expect(getPendingExtractionResults(sessionDir)).toEqual([]);
  });
});
