import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runExtract } from '../../../src/commands/extract.js';
import { appendSessionResults, getPendingExtractionResults, initSessionDir, loadSessionResults, recordExtractionOutcome } from '../../../src/deep/session.js';

describe('runExtract', () => {
  const sessionDir = mkdtempSync(join(tmpdir(), 'sxng-extract-'));
  afterEach(() => { vi.restoreAllMocks(); rmSync(sessionDir, { recursive: true, force: true }); });

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
