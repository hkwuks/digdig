import { describe, it, expect } from 'vitest';
import { buildCoverage } from '../../src/deep/coverage.js';
import type { SessionResult } from '../../src/deep/session.js';

function result(
    url: string,
    round: number,
    overrides: Partial<SessionResult> = {}
): SessionResult {
    return {
        id: url,
        url,
        title: overrides.title ?? url,
        contentType: 'extracted',
        extractor: 'test',
        extractedAt: 1,
        status: 'pending',
        revision: 1,
        origins: [{ tool: 'digdig', query: `query-${round}`, round }],
        ...overrides,
    };
}

describe('buildCoverage', () => {
    it('groups results under the round that first saw them', () => {
        const report = buildCoverage([
            result('https://a.com/1', 1),
            result('https://a.com/2', 1),
            result('https://b.com/3', 2),
        ], 2);

        expect(report.byRound).toHaveLength(2);
        expect(report.byRound[0]).toMatchObject({ round: 1, newResults: 2, queries: ['query-1'] });
        expect(report.byRound[1]).toMatchObject({ round: 2, newResults: 1, queries: ['query-2'] });
    });

    it('does not count a repeated result as new in the round that saw it again', () => {
        const repeatedResult = result('https://a.com/shared', 1);
        repeatedResult.origins.push({ tool: 'digdig', query: 'query-2', round: 2 });
        const report = buildCoverage([repeatedResult, result('https://b.com/new', 2)], 2);

        expect(report.byRound.find(r => r.round === 1)!.newResults).toBe(1);
        // Round 2 introduced one genuinely new result, not two.
        expect(report.byRound.find(r => r.round === 2)!.newResults).toBe(1);
        // Round 1 had seen nothing earlier; round 2 saw one it already knew.
        expect(report.byRound.find(r => r.round === 1)!.repeatedFromEarlier).toBe(0);
        expect(report.byRound.find(r => r.round === 2)!.repeatedFromEarlier).toBe(1);
    });

    it('records the query of a round even when everything it returned was already known', () => {
        const known = result('https://a.com/only', 1);
        known.origins.push({ tool: 'digdig', query: 'repeat-query', round: 2 });
        const report = buildCoverage([known], 2);

        const round2 = report.byRound.find(r => r.round === 2)!;
        expect(round2.newResults).toBe(0);
        expect(round2.queries).toEqual(['repeat-query']);
        expect(round2.repeatedFromEarlier).toBe(1);
    });

    it('reports which results two rounds both returned', () => {
        const shared = result('https://a.com/shared', 1);
        shared.origins.push({ tool: 'digdig', query: 'query-2', round: 2 });
        const report = buildCoverage([shared, result('https://b.com/only', 1)], 2);

        expect(report.repeated).toEqual([{ url: 'https://a.com/shared', rounds: [1, 2] }]);
    });

    it('lists titles per round, capped', () => {
        const results = Array.from({ length: 30 }, (_, i) =>
            result(`https://d${i}.com`, 1, { title: `Title ${i}` }));
        const report = buildCoverage(results, 1, { titlesPerRound: 5 });

        expect(report.byRound[0].titles).toHaveLength(5);
    });

    it('names each round by terms confined to it, not by the shared subject', () => {
        const report = buildCoverage([
            result('https://a.com/1', 1, { title: 'scheduler work stealing', content: 'tokio async scheduler queue' }),
            result('https://a.com/2', 1, { title: 'scheduler queue', content: 'tokio async scheduler queue' }),
            result('https://b.com/1', 2, { title: 'epoll readiness reactor', content: 'tokio async epoll reactor' }),
            result('https://b.com/2', 2, { title: 'epoll reactor', content: 'tokio async epoll reactor' }),
        ], 2);

        const terms = report.distinctiveTerms;
        // Spread across both rounds: the session's subject, not an aspect.
        expect(terms.map(t => t.term)).not.toContain('tokio');
        expect(terms.map(t => t.term)).not.toContain('async');
        // Confined to round 1 / round 2 respectively. `stealing` and `work` occur
        // in only one result each and are dropped as stray tokens.
        expect(terms.filter(t => t.round === 1).map(t => t.term)).toEqual(
            expect.arrayContaining(['scheduler', 'queue']),
        );
        expect(terms.filter(t => t.round === 1).map(t => t.term)).not.toContain('stealing');
        expect(terms.filter(t => t.round === 2).map(t => t.term)).toEqual(
            expect.arrayContaining(['epoll', 'reactor']),
        );
    });

    it('drops terms that appear in only one result', () => {
        const report = buildCoverage([
            result('https://a.com/1', 1, { title: 'alpha shared', content: 'alpha shared' }),
            result('https://a.com/2', 1, { title: 'shared uniquetoken', content: 'shared uniquetoken' }),
            result('https://a.com/3', 1, { title: 'shared', content: 'shared' }),
        ], 1);

        expect(report.distinctiveTerms.map(t => t.term)).not.toContain('uniquetoken');
        expect(report.distinctiveTerms.map(t => t.term)).toContain('shared');
    });

    it('reports the strongest round-local terms first', () => {
        const report = buildCoverage([
            result('https://a.com/1', 1, { title: 'alpha alpha-cluster', content: 'alpha alpha-cluster' }),
            result('https://a.com/2', 1, { title: 'alpha alpha-cluster', content: 'alpha alpha-cluster' }),
            result('https://a.com/3', 1, { title: 'once-only', content: 'once-only' }),
            result('https://a.com/4', 1, { title: 'once-only', content: 'once-only' }),
        ], 1);

        const counts = report.distinctiveTerms.map(t => t.docFreq);
        const sorted = [...counts].sort((a, b) => b - a);
        expect(counts).toEqual(sorted);
    });

    it('names each round from snippets before any extraction has run', () => {
        // A search result stores its body in `excerpt`; `content` stays empty
        // until extract writes it. Reading only `content` left the command with
        // titles alone, and every title token occurred once, so the whole
        // section came out empty on a real zero-extraction session.
        const report = buildCoverage([
            result('https://a.com/1', 1, { title: 'Scheduler notes', content: '', excerpt: 'tokio scheduler queue runtime' }),
            result('https://a.com/2', 1, { title: 'Queue notes', content: '', excerpt: 'tokio scheduler queue stealing' }),
            result('https://b.com/1', 2, { title: 'Driver notes', content: '', excerpt: 'tokio epoll reactor readiness' }),
            result('https://b.com/2', 2, { title: 'Loop notes', content: '', excerpt: 'tokio epoll reactor event' }),
        ], 2);

        expect(report.distinctiveTerms.map(t => t.term)).toEqual(
            expect.arrayContaining(['scheduler', 'queue', 'epoll', 'reactor']),
        );
        expect(report.distinctiveTerms.map(t => t.term)).not.toContain('tokio');
    });

    it('lists the sources it drew from and the specialized ones it never touched', () => {
        const report = buildCoverage([
            result('https://www.example.com/a', 1),
            result('https://example.com/b', 1),
            result('https://github.com/x/y', 2),
            result('file:///docs/local.md#chunk-0', 2),
        ], 2);

        // `www.` folds, and a local document counts as a source under its path
        // rather than vanishing for having no host.
        expect(report.domainsSeen).toEqual([
            { domain: 'example.com', results: 2 },
            { domain: '/docs/local.md', results: 1 },
            { domain: 'github.com', results: 1 },
        ]);
        // github.com is touched, everything else on the list is not.
        expect(report.untouchedSpecialized).not.toContain('github.com');
        expect(report.untouchedSpecialized).toContain('arxiv.org');
    });

    it('counts each local document as its own source', () => {
        // Two chunks of one file share a path, so they are one source; a second
        // file is a second source. Before this, every `file:` URL was dropped
        // and a pure local session reported zero sources.
        const report = buildCoverage([
            result('file:///docs/a.md#chunk-0', 1),
            result('file:///docs/a.md#chunk-1', 1),
            result('file:///docs/b.md#chunk-0', 2),
        ], 2);

        expect(report.domainsSeen).toEqual([
            { domain: '/docs/a.md', results: 2 },
            { domain: '/docs/b.md', results: 1 },
        ]);
    });

    it('handles a session with no round information', () => {
        const noRound: SessionResult = {
            ...result('https://a.com/1', 1),
            origins: [{ tool: 'user', query: 'q' }],
        };
        const report = buildCoverage([noRound], 0);

        expect(report.byRound).toEqual([]);
        expect(report.uniqueResults).toBe(1);
    });
});
