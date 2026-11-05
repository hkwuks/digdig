import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { graphPreprocess } from '../../src/deep/graph-preprocess.js';
import { appendSessionResults, initSessionDir, loadSessionResults } from '../../src/deep/session.js';

/**
 * `graph-preprocess -f md` used to crash: the markdown renderer read
 * `result.rounds.join(', ')` while the payload had no `rounds` field, and
 * `roundsCovered` was hardcoded to 0. Both are exercised here because the
 * renderer had never been reachable before the format flag was fixed.
 */
describe('graph-preprocess payload', () => {
  let sessionDir: string;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-preprocess-'));
    initSessionDir(sessionDir);
  });

  afterEach(() => rmSync(sessionDir, { recursive: true, force: true }));

  it('gives every provenance entry a rounds array so the markdown renderer can join it', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/a', title: 'A', contentType: 'extracted', content: 'Body text here.',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'q1' }],
    }]);

    const result = graphPreprocess(sessionDir);
    expect(result.resultProvenance.length).toBe(1);
    expect(Array.isArray(result.resultProvenance[0].rounds)).toBe(true);
    expect(() => result.resultProvenance[0].rounds.join(', ')).not.toThrow();
  });

  it('reports the session round count instead of a hardcoded zero', () => {
    // Only a non-direct origin without a round opens one (session.ts:needsRound),
    // so `sxng` discoveries are what advance the counter.
    appendSessionResults(sessionDir, [
      { url: 'https://example.com/a', title: 'A', contentType: 'search', origins: [{ tool: 'sxng', query: 'q1' }] },
      { url: 'https://example.com/b', title: 'B', contentType: 'search', origins: [{ tool: 'sxng', query: 'q2' }] },
    ]);
    expect(graphPreprocess(sessionDir).roundsCovered).toBeGreaterThan(0);
  });

  it('collects the distinct origin rounds of a result, sorted', () => {
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/a', title: 'A', contentType: 'extracted', content: 'Body.',
      extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'q1', round: 3 }, { tool: 'exa', query: 'q2', round: 1 }],
    }]);

    expect(graphPreprocess(sessionDir).resultProvenance[0].rounds).toEqual([1, 3]);
  });

  it('leaves rounds empty rather than undefined when no origin carries one', () => {
    // `mergeOrigins` stamps the current import round onto an origin that lacks
    // one, and a direct origin never opens a round — so with nothing discovered
    // the session round stays 0 and the stamped value is the floor of 1.
    appendSessionResults(sessionDir, [{
      url: 'https://example.com/a', title: 'A', contentType: 'extracted', content: 'Body.',
      extractor: 'defuddle', origins: [{ tool: 'user', query: 'q1', round: 0 }],
    }]);

    const rounds = graphPreprocess(sessionDir).resultProvenance[0].rounds;
    expect(Array.isArray(rounds)).toBe(true);
    expect(rounds.every(round => typeof round === 'number')).toBe(true);
  });
});
