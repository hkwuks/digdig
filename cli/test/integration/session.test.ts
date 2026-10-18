import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  appendSessionResults,
  approveResults,
  getPendingExtractionResults,
  getPendingResults,
  initSessionDir,
  injectApprovedResults,
  loadSessionGraph,
  loadSessionResults,
  recordExtractionOutcome,
  setSkipped,
  validateSessionInputFile,
} from '../../src/deep/session.js';
import { loadClaims, loadEvidences, loadReviews, saveClaims, saveEvidences, saveReviews } from '../../src/claims/store.js';

describe('session result contract', () => {
  let sessionDir: string;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-session-'));
    initSessionDir(sessionDir);
  });

  afterEach(() => rmSync(sessionDir, { recursive: true, force: true }));

  it('stores discovery separately from an extracted body and gives it a stable revision', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', excerpt: 'search snippet',
      origins: [{ tool: 'sxng', engine: 'google', query: 'example query' }],
    }]);

    const [result] = loadSessionResults(sessionDir);
    expect(result).toMatchObject({
      contentType: 'search', status: 'pending', revision: 1,
      origins: [{ tool: 'sxng', engine: 'google', query: 'example query', round: 1 }],
    });
    expect(result.id).toMatch(/^r:/);
    expect(result.content).toBeUndefined();
    expect(getPendingExtractionResults(sessionDir)).toHaveLength(1);
    expect(getPendingResults(sessionDir)).toHaveLength(0);
  });

  it('keeps a search result body as excerpt and never stores the search layer\'s snippet name', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article',
      content: 'The provider body text.', snippet: 'short blurb',
      origins: [{ tool: 'sxng', engine: 'google', query: 'example query' }],
    }]);

    const [result] = loadSessionResults(sessionDir);
    expect(result.contentType).toBe('search');
    // The body survives, in this layer's slot for it — not deleted, and not left
    // under the search layer's `content`, which is reserved for a verified extraction.
    expect(result.excerpt).toBe('The provider body text.');
    expect(result.content).toBeUndefined();
    // One slot, one name: `snippet` is the search layer's word for `excerpt`.
    expect(result.snippet).toBeUndefined();
    expect('snippet' in result).toBe(false);
  });

  it('falls back to snippet for a search result that has no body, and keeps an explicit excerpt', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/no-body', title: 'No body', snippet: 'only a blurb',
      origins: [{ tool: 'deepseek', query: 'q' }],
    }]);
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/explicit', title: 'Explicit', excerpt: 'given excerpt', content: 'a body',
      origins: [{ tool: 'sxng', query: 'q' }],
    }]);

    const byUrl = new Map(loadSessionResults(sessionDir).map(r => [r.url, r]));
    expect(byUrl.get('https://example.com/no-body')!.excerpt).toBe('only a blurb');
    // An explicit `excerpt` wins over the body: it is the caller's own decision.
    expect(byUrl.get('https://example.com/explicit')!.excerpt).toBe('given excerpt');
  });

  it('refreshes excerpt from the latest search body on the update path', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', content: 'First body',
      origins: [{ tool: 'sxng', query: 'q' }],
    }]);
    // Same URL, a longer body: the entry exists, so this is the update branch.
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', content: 'Second, longer body',
      origins: [{ tool: 'sxng', query: 'q' }],
    }]);

    const [result] = loadSessionResults(sessionDir);
    // A later search for the same URL is fresher text, and nothing verified has
    // replaced it, so it wins. An extracted entry is exempt: its excerpt is the
    // page description, and the branch above requires a search-type input.
    expect(result.excerpt).toBe('Second, longer body');
    expect(loadSessionResults(sessionDir)).toHaveLength(1);
  });

  it('leaves an extracted entry\'s excerpt alone when a search result carries the same URL', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted',
      content: 'Verified body.', extractor: 'defuddle', extractedAt: 1, excerpt: 'page description',
      origins: [{ tool: 'sxng', query: 'q' }],
    }]);
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', content: 'provider body',
      origins: [{ tool: 'sxng', query: 'q' }],
    }]);

    const [result] = loadSessionResults(sessionDir);
    expect(result).toMatchObject({ contentType: 'extracted', content: 'Verified body.' });
    expect(result.excerpt).toBe('page description');
  });

  it('drops a stray snippet from an extracted result without touching its body', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted',
      content: 'Verified body.', extractor: 'defuddle', extractedAt: 1, snippet: 'blurb',
      origins: [{ tool: 'sxng', query: 'q' }],
    }]);

    const [result] = loadSessionResults(sessionDir);
    expect(result).toMatchObject({ contentType: 'extracted', content: 'Verified body.', extractor: 'defuddle' });
    expect('snippet' in result).toBe(false);
  });

  it('approves only an extracted result with the matching id and revision', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted',
      content: 'A short but real body is still a successful extraction.', extractor: 'defuddle',
      extractedAt: 1, origins: [{ tool: 'sxng', query: 'example query' }],
    }]);
    const [result] = loadSessionResults(sessionDir);

    expect(approveResults(sessionDir, [{ id: result.id, revision: result.revision + 1 }]).error)
      .toMatchObject({ code: 'RESULT_REVISION_CONFLICT' });
    const approval = approveResults(sessionDir, [{ id: result.id, revision: result.revision }]);
    expect(approval.approved).toBe(1);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({ status: 'approved', revision: 2 });
  });

  it('records blank extraction as failure and a nonempty short body as success', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', origins: [{ tool: 'sxng', query: 'query' }],
    }]);
    recordExtractionOutcome(sessionDir, [{
      url: 'https://example.com/article', failure: { code: 'empty', message: 'blank response' },
    }]);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({ failureCount: 1, lastFailure: { code: 'empty' } });

    recordExtractionOutcome(sessionDir, [{
      url: 'https://example.com/article', content: 'Short body.', extractor: 'defuddle', extractedAt: 2,
    }]);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({
      contentType: 'extracted', content: 'Short body.', extractor: 'defuddle', extractedAt: 2,
    });
    expect(loadSessionResults(sessionDir)[0].failureCount).toBeUndefined();
  });

  it('makes an identical imported body pending again and clears a prior skip', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Stable body.',
      extractor: 'external', extractedAt: 1, origins: [{ tool: 'exa', query: 'query' }],
    }]);
    const [initial] = loadSessionResults(sessionDir);
    approveResults(sessionDir, [{ id: initial.id, revision: initial.revision }]);
    const approved = loadSessionResults(sessionDir)[0];
    setSkipped(sessionDir, [{ id: approved.id, revision: approved.revision }], true);

    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Stable body.',
      extractor: 'external', extractedAt: 2, origins: [{ tool: 'exa', query: 'query' }],
    }]);
    const refreshed = loadSessionResults(sessionDir)[0];
    expect(refreshed).toMatchObject({ status: 'pending', extractedAt: 2 });
    expect(refreshed.skippedAt).toBeUndefined();
  });

  it('does not overwrite corrupt claim state while accepting a new extracted body', () => {
    appendSessionResults(sessionDir, [{ url: 'https://example.com/article', title: 'Article', origins: [{ tool: 'sxng', query: 'query' }] }]);
    const claimsFile = join(sessionDir, 'claims', 'claims.json');
    mkdirSync(join(sessionDir, 'claims'), { recursive: true });
    writeFileSync(claimsFile, '{invalid', 'utf8');
    recordExtractionOutcome(sessionDir, [{ url: 'https://example.com/article', content: 'Body.', extractor: 'defuddle', extractedAt: 1 }]);
    expect(loadSessionResults(sessionDir)[0].content).toBe('Body.');
    expect(readFileSync(claimsFile, 'utf8')).toBe('{invalid');
  });

  it('retains local document chunk fragments as separate stable results', () => {
    appendSessionResults(sessionDir, [
      { url: 'file:///docs/notes.md#chunk-0', title: 'Notes', contentType: 'extracted', content: 'One', extractor: 'local-index', origins: [{ tool: 'local-index', query: 'notes' }] },
      { url: 'file:///docs/notes.md#chunk-1', title: 'Notes', contentType: 'extracted', content: 'Two', extractor: 'local-index', origins: [{ tool: 'local-index', query: 'notes' }] },
    ]);
    expect(loadSessionResults(sessionDir).map(result => result.id)).toHaveLength(2);
    expect(new Set(loadSessionResults(sessionDir).map(result => result.id)).size).toBe(2);
  });

  it('injects structural edges only after approval', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Body',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'example query' }],
    }]);
    const [result] = loadSessionResults(sessionDir);
    const approval = approveResults(sessionDir, [{ id: result.id, revision: result.revision }]);
    const injected = injectApprovedResults(sessionDir, approval.approvedResults);
    expect(injected.nodesAdded).toBeGreaterThan(0);
    expect(loadSessionGraph(sessionDir).someNode((_id, attrs) => attrs.type === 'result')).toBe(true);
  });

  it('repairs prior evidence, reviews, and graph data after an imported body changes', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Original body.',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'example query' }],
    }]);
    const [initial] = loadSessionResults(sessionDir);
    const approval = approveResults(sessionDir, [{ id: initial.id, revision: initial.revision }]);
    injectApprovedResults(sessionDir, approval.approvedResults);
    saveClaims(sessionDir, [{ id: 'cl_001', text: 'Original body', riskLevel: 'medium', status: 'reviewed', sessionDir, createdAt: 1 }]);
    saveEvidences(sessionDir, [{
      id: 'ev_001', claimId: 'cl_001', resultId: initial.id, resultUrl: initial.url,
      quote: 'Original body.', charStart: 0, charEnd: 14, contentHash: 'fixture', extractedAt: initial.extractedAt!,
    }]);
    saveReviews(sessionDir, [{
      claimId: 'cl_001', decision: 'approved', autoPass: true,
      checks: { sourceIndependent: true, hasRefute: false, allSupport: true },
      matchedRule: 'fixture', reviewer: 'agent', reviewedAt: 1,
    }]);

    appendSessionResults(sessionDir, [{
      url: initial.url, title: 'Article', contentType: 'extracted', content: 'Replacement body.',
      extractor: 'external', origins: [{ tool: 'exa', query: 'example query' }],
    }]);

    expect(loadSessionResults(sessionDir)[0].status).toBe('pending');
    expect(loadEvidences(sessionDir)[0]).toMatchObject({ invalid: true, invalidationReason: 'contentChanged' });
    expect(loadClaims(sessionDir)[0].status).toBe('verifying');
    expect(loadReviews(sessionDir)).toEqual([]);
    expect(loadSessionGraph(sessionDir).hasNode(initial.id)).toBe(false);
  });

  it('repairs stale graph data during read-only graph loading', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Verified body.',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'example query' }],
    }]);
    const [initial] = loadSessionResults(sessionDir);
    const approval = approveResults(sessionDir, [{ id: initial.id, revision: initial.revision }]);
    injectApprovedResults(sessionDir, approval.approvedResults);
    expect(loadSessionGraph(sessionDir).hasNode(initial.id)).toBe(true);

    const resultsFile = join(sessionDir, 'results.json');
    const state = JSON.parse(readFileSync(resultsFile, 'utf8'));
    state.data.results[0].skippedAt = Date.now();
    state.data.results[0].revision += 1;
    writeFileSync(resultsFile, JSON.stringify(state, null, 2), 'utf8');

    expect(loadSessionGraph(sessionDir).hasNode(initial.id)).toBe(false);
  });

  it('requires reapproval after an approved result is unskipped', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/article', title: 'Article', contentType: 'extracted', content: 'Verified body.',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'example query' }],
    }]);
    const [initial] = loadSessionResults(sessionDir);
    approveResults(sessionDir, [{ id: initial.id, revision: initial.revision }]);
    const approved = loadSessionResults(sessionDir)[0];

    setSkipped(sessionDir, [{ id: approved.id, revision: approved.revision }], true);
    const skipped = loadSessionResults(sessionDir)[0];
    setSkipped(sessionDir, [{ id: skipped.id, revision: skipped.revision }], false);

    expect(loadSessionResults(sessionDir)[0].status).toBe('pending');
    expect(loadSessionResults(sessionDir)[0].skippedAt).toBeUndefined();
  });

  it('accepts Agent JSON only inside the owning session agent-inputs directory', () => {
    expect(validateSessionInputFile(sessionDir, join(sessionDir, 'agent-inputs', 'request.json'))).toBeUndefined();
    expect(validateSessionInputFile(sessionDir, join(sessionDir, '..', 'request.json'))).toBeUndefined();
  });
});
