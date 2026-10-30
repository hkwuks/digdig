import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runResultsAdd } from '../../src/commands/results-add.js';
import { initSessionDir, loadSessionResults, loadSessionRounds } from '../../src/deep/session.js';
import { assessLatestResultQuality } from '../../src/deep/quality-assess.js';

describe('results-add command', () => {
  let sessionDir: string;

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-results-add-'));
    initSessionDir(sessionDir);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it('imports external search discovery without treating its excerpt as a body', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'search.json');
    writeFileSync(dataFile, JSON.stringify([{
      url: 'https://example.com/article', title: 'Article', excerpt: 'Search result summary', engine: 'google',
    }]), 'utf8');

    expect(await runResultsAdd({ session: sessionDir, kind: 'search', dataFile, tool: 'exa', query: 'external query' })).toBe(0);
    expect(loadSessionResults(sessionDir)[0]).toMatchObject({
      contentType: 'search', excerpt: 'Search result summary',
      origins: [{ tool: 'exa', engine: 'google', query: 'external query', round: 1 }],
    });
    expect(loadSessionResults(sessionDir)[0].content).toBeUndefined();
  });

  it('imports a verified external body with immediate extraction time when absent', async () => {
    const dataFile = join(sessionDir, 'agent-inputs', 'body.json');
    writeFileSync(dataFile, JSON.stringify([{
      url: 'https://example.com/article', title: 'Article', content: 'Externally extracted body.', extractor: 'tavily-extract',
    }]), 'utf8');

    expect(await runResultsAdd({ session: sessionDir, kind: 'extracted', dataFile, tool: 'tavily', query: 'external query' })).toBe(0);
    const [result] = loadSessionResults(sessionDir);
    expect(result).toMatchObject({ contentType: 'extracted', content: 'Externally extracted body.', extractor: 'tavily-extract' });
    expect(result.extractedAt).toEqual(expect.any(Number));
  });

  it('rejects JSON outside the owning agent-inputs directory', async () => {
    const dataFile = join(sessionDir, 'outside.json');
    writeFileSync(dataFile, '[]', 'utf8');
    expect(await runResultsAdd({ session: sessionDir, kind: 'search', dataFile, tool: 'exa', query: 'query' })).toBe(1);
    expect(loadSessionResults(sessionDir)).toEqual([]);
  });

  describe('round accounting', () => {
    it('opens a round for a search import', async () => {
      const dataFile = join(sessionDir, 'agent-inputs', 'search-round.json');
      writeFileSync(dataFile, JSON.stringify([{ url: 'https://example.com/a', title: 'A', excerpt: 'blurb' }]), 'utf8');

      expect(await runResultsAdd({ session: sessionDir, kind: 'search', dataFile, tool: 'exa', query: 'q' })).toBe(0);
      expect(loadSessionRounds(sessionDir)).toBe(1);
    });

    it('does not open a round when an extracted body completes an existing result', async () => {
      const searchFile = join(sessionDir, 'agent-inputs', 'search-first.json');
      writeFileSync(searchFile, JSON.stringify([{ url: 'https://example.com/a', title: 'A', excerpt: 'blurb' }]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'search', dataFile: searchFile, tool: 'exa', query: 'q' });
      expect(loadSessionRounds(sessionDir)).toBe(1);

      const bodyFile = join(sessionDir, 'agent-inputs', 'body-second.json');
      writeFileSync(bodyFile, JSON.stringify([{
        url: 'https://example.com/a', title: 'A', content: 'The extracted body.', extractor: 'defuddle',
      }]), 'utf8');
      expect(await runResultsAdd({ session: sessionDir, kind: 'extracted', dataFile: bodyFile, tool: 'defuddle', query: 'q' })).toBe(0);

      // The body must still land — only the round counter is untouched.
      expect(loadSessionRounds(sessionDir)).toBe(1);
      expect(loadSessionResults(sessionDir)[0]).toMatchObject({ contentType: 'extracted', content: 'The extracted body.' });
    });

    it('still opens a round for the next search after an extraction', async () => {
      const first = join(sessionDir, 'agent-inputs', 's1.json');
      writeFileSync(first, JSON.stringify([{ url: 'https://example.com/a', title: 'A', excerpt: 'blurb' }]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'search', dataFile: first, tool: 'exa', query: 'q1' });

      const body = join(sessionDir, 'agent-inputs', 'b1.json');
      writeFileSync(body, JSON.stringify([{ url: 'https://example.com/a', title: 'A', content: 'Body.', extractor: 'defuddle' }]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'extracted', dataFile: body, tool: 'defuddle', query: 'q1' });

      const second = join(sessionDir, 'agent-inputs', 's2.json');
      writeFileSync(second, JSON.stringify([{ url: 'https://example.com/b', title: 'B', excerpt: 'blurb' }]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'search', dataFile: second, tool: 'exa', query: 'q2' });

      expect(loadSessionRounds(sessionDir)).toBe(2);
    });

    it('does not make the quality verdict worse when an extraction lands', async () => {
      // The defect AC4 targets is extraction opening a thin round of its own,
      // which assessed only the extracted subset and read as a drop. After the
      // round fix the extracted body joins the round that found it, so the
      // assessed set is unchanged and contentDepth can only rise.
      //
      // The verdict is therefore not required to stay *identical* — writing a
      // body genuinely improves contentDepth. What must hold is that extraction
      // never makes it worse.
      const rank = { poor: 0, acceptable: 1, good: 2 } as const;
      const searchFile = join(sessionDir, 'agent-inputs', 'quality-before.json');
      writeFileSync(searchFile, JSON.stringify([
        { url: 'https://a.example.com/1', title: 'A1', excerpt: 'blurb one '.repeat(40) },
        { url: 'https://b.example.com/2', title: 'B2', excerpt: 'blurb two '.repeat(40) },
        { url: 'https://c.example.com/3', title: 'C3', excerpt: 'blurb three '.repeat(40) },
      ]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'search', dataFile: searchFile, tool: 'exa', query: 'q' });

      const before = assessLatestResultQuality(loadSessionResults(sessionDir));
      const roundsBefore = loadSessionRounds(sessionDir);

      const bodyFile = join(sessionDir, 'agent-inputs', 'quality-body.json');
      writeFileSync(bodyFile, JSON.stringify([
        { url: 'https://a.example.com/1', title: 'A1', content: 'Extracted body one. '.repeat(20), extractor: 'defuddle' },
      ]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'extracted', dataFile: bodyFile, tool: 'defuddle', query: 'q' });

      const after = assessLatestResultQuality(loadSessionResults(sessionDir));
      expect(loadSessionRounds(sessionDir)).toBe(roundsBefore);
      expect(rank[after.verdict]).toBeGreaterThanOrEqual(rank[before.verdict]);
      // And the body really landed — this is not a no-op passing trivially.
      expect(loadSessionResults(sessionDir).find(r => r.url === 'https://a.example.com/1')!.content)
        .toContain('Extracted body one.');
    });

    it('keeps the first-seen round on an origin when a later round returns the same URL', async () => {
      // Coverage attributes a result to the round that first saw it, so the
      // earlier origin must survive a repeat rather than being overwritten with
      // the newer round.
      const first = join(sessionDir, 'agent-inputs', 'revisit-1.json');
      writeFileSync(first, JSON.stringify([{ url: 'https://example.com/shared', title: 'S', excerpt: 'blurb' }]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'search', dataFile: first, tool: 'exa', query: 'q1' });

      const second = join(sessionDir, 'agent-inputs', 'revisit-2.json');
      writeFileSync(second, JSON.stringify([
        { url: 'https://example.com/shared', title: 'S', excerpt: 'blurb again' },
        { url: 'https://example.com/fresh', title: 'F', excerpt: 'new blurb' },
      ]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'search', dataFile: second, tool: 'exa', query: 'q2' });

      expect(loadSessionRounds(sessionDir)).toBe(2);
      const shared = loadSessionResults(sessionDir).find(r => r.url === 'https://example.com/shared')!;
      // Both sightings are recorded, each with the round it happened in.
      expect(shared.origins.map(o => o.round).sort()).toEqual([1, 2]);
      // The first sighting is still attributable to round 1.
      expect(shared.origins.find(o => o.query === 'q1')!.round).toBe(1);
    });

    it('records a round on every origin, including an extraction origin', async () => {
      const search = join(sessionDir, 'agent-inputs', 'so.json');
      writeFileSync(search, JSON.stringify([{ url: 'https://example.com/a', title: 'A', excerpt: 'blurb' }]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'search', dataFile: search, tool: 'exa', query: 'q' });

      const body = join(sessionDir, 'agent-inputs', 'bo.json');
      writeFileSync(body, JSON.stringify([{ url: 'https://example.com/a', title: 'A', content: 'Body.', extractor: 'defuddle' }]), 'utf8');
      await runResultsAdd({ session: sessionDir, kind: 'extracted', dataFile: body, tool: 'defuddle', query: 'q' });

      const origins = loadSessionResults(sessionDir)[0].origins;
      expect(origins.length).toBeGreaterThan(1);
      for (const origin of origins) expect(origin.round).toBe(1);
    });
  });
});
