import { describe, it, expect } from 'vitest';
import { buildPendingReport, describeResult } from '../../src/deep/pending-facts.js';
import type { SessionResult } from '../../src/deep/session.js';

function result(url: string, overrides: Partial<SessionResult> = {}): SessionResult {
    return {
        id: url,
        url,
        title: overrides.title ?? url,
        contentType: 'search',
        status: 'pending',
        revision: 1,
        origins: [{ tool: 'digdig', query: 'q', round: 1 }],
        ...overrides,
    };
}

describe('describeResult', () => {
    it('reports a search result as unextracted rather than counting its snippet as a body', () => {
        // A search result keeps its snippet in `excerpt`; `content` stays empty
        // until an extractor writes it. Reading `content || excerpt` here made
        // every unread result look read.
        const fact = describeResult(result('https://a.com/1', {
            contentType: 'search',
            content: '',
            excerpt: 'A page description that is not a body.',
        }));

        expect(fact.contentLength).toBe(0);
        expect(fact.extracted).toBe(false);
        expect(fact.verified).toBe(false);
    });

    it('reports an extracted result with its body length', () => {
        const fact = describeResult(result('https://a.com/1', {
            contentType: 'extracted',
            content: 'x'.repeat(900),
            extractor: 'defuddle',
            extractedAt: 1,
        }));

        expect(fact.contentLength).toBe(900);
        expect(fact.extracted).toBe(true);
        expect(fact.verified).toBe(true);
    });

    it('tells a readable body apart from an approvable record', () => {
        // A body with no extractor metadata is readable but cannot be approved.
        const fact = describeResult(result('https://a.com/1', {
            content: 'x'.repeat(500),
            extractor: undefined,
            extractedAt: undefined,
        }));

        expect(fact.extracted).toBe(true);
        expect(fact.verified).toBe(false);
    });

    it('omits the round on a session that predates round tracking', () => {
        const legacy = result('https://a.com/1');
        delete (legacy as { origins?: unknown }).origins;

        const fact = describeResult(legacy);

        expect(fact).not.toHaveProperty('round');
        expect(fact.url).toBe('https://a.com/1');
    });

    it('reports the first round a result was seen in, not the latest', () => {
        const fact = describeResult(result('https://a.com/1', {
            origins: [
                { tool: 'digdig', query: 'q1', round: 1 },
                { tool: 'digdig', query: 'q3', round: 3 },
            ],
        }));

        expect(fact.round).toBe(1);
    });

    it('names a local document by its path', () => {
        const fact = describeResult(result('file:///docs/notes.md#chunk-0'));

        expect(fact.domain).toBe('/docs/notes.md');
    });
});

describe('buildPendingReport', () => {
    it('counts every stored result, not only the pending ones', () => {
        const all = [
            result('https://a.com/1', { contentType: 'extracted', content: 'body', extractor: 'x', extractedAt: 1 }),
            result('https://b.com/2', { status: 'approved', contentType: 'extracted', content: 'body', extractor: 'x', extractedAt: 1 }),
            result('https://c.com/3'),
        ];

        const report = buildPendingReport(all, [all[0]]);

        expect(report.total).toBe(3);
        expect(report.extracted).toBe(2);
        expect(report.unextracted).toBe(1);
        expect(report.pending).toHaveLength(1);
    });

    it('counts distinct sources across the session', () => {
        const all = [
            result('https://www.example.com/a'),
            result('https://example.com/b'),
            result('file:///docs/local.md#chunk-0'),
        ];

        const report = buildPendingReport(all, all);

        expect(report.sources).toBe(2);
        expect(report.sourceList).toEqual(['/docs/local.md', 'example.com']);
    });

    it('reports an empty session as zero rather than failing', () => {
        const report = buildPendingReport([], []);

        expect(report).toMatchObject({ total: 0, extracted: 0, unextracted: 0, sources: 0, pending: [] });
    });

    it('carries no judgement fields', () => {
        // The point of the module: it counts, it does not conclude.
        const report = buildPendingReport([result('https://a.com/1')], [result('https://a.com/1')]);

        expect(Object.keys(report).sort()).toEqual(
            ['extracted', 'pending', 'sourceList', 'sources', 'total', 'unextracted'],
        );
    });
});
