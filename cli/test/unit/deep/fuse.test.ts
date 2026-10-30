import { describe, it, expect } from 'vitest';
import { fuseResults } from '../../src/deep/fuse.js';
import { resultUrlKey } from '../../src/deep/dedupe.js';
import type { SearchResponse, SearchResult } from '../../src/service.js';

function result(url: string, overrides: Partial<SearchResult> = {}): SearchResult {
    return {
        title: overrides.title ?? url,
        url,
        content: overrides.content ?? `body for ${url}`,
        engine: overrides.engine ?? 'google',
        category: 'general',
        ...overrides,
    };
}

function response(query: string, results: SearchResult[]): SearchResponse {
    return {
        query,
        numberOfResults: results.length,
        results,
        suggestions: [],
        answers: [],
        corrections: [],
        infoboxes: [],
        unresponsiveEngines: [],
    };
}

describe('fuseResults', () => {
    it('counts a duplicate id once inside one ranking', () => {
        const output = fuseResults({
            responses: [response('q', [result('https://a.com'), result('https://b.com'), result('https://a.com')])],
            onlyCurrent: false,
            limit: 0,
        });

        const a = output.fused.find(item => item.id.includes('a.com'))!;
        // 1/61 for one appearance; a second appearance at a later position would add another term.
        expect(a.score).toBeCloseTo(1 / 61, 10);
    });

    it('displays only this invocation results when onlyCurrent is set', () => {
        const output = fuseResults({
            responses: [response('new', [result('https://new.com')])],
            sessionSnapshot: [result('https://old.com')],
            onlyCurrent: true,
            limit: 0,
        });

        expect(output.display.map(r => r.url)).toEqual(['https://new.com']);
        expect(output.fused.map(item => item.id).some(id => id.includes('old.com'))).toBe(true);
    });

    it('lets history raise a current result score without displaying history', () => {
        const output = fuseResults({
            responses: [response('new', [result('https://both.com'), result('https://only-new.com')])],
            sessionSnapshot: [result('https://both.com')],
            onlyCurrent: true,
            limit: 0,
        });

        const both = output.display.find(r => r.url === 'https://both.com')!;
        const only = output.display.find(r => r.url === 'https://only-new.com')!;
        expect(both.fusionScore!).toBeGreaterThan(only.fusionScore!);
    });

    it('merges the same URL arriving from two providers into one result', () => {
        const output = fuseResults({
            responses: [
                response('q', [result('https://same.com', { engine: 'google' })]),
                response('q', [result('https://same.com', { engine: 'deepseek' })]),
            ],
            onlyCurrent: false,
            limit: 0,
        });

        expect(output.fused).toHaveLength(1);
        expect(output.display).toHaveLength(1);
    });

    it('ranks merge-file results alongside the live ones', () => {
        const output = fuseResults({
            responses: [response('q', [result('https://live.com')])],
            mergeResults: [result('https://merged.com')],
            onlyCurrent: false,
            limit: 0,
        });

        const urls = output.display.map(r => r.url);
        expect(urls).toContain('https://merged.com');
        expect(urls).toContain('https://live.com');
    });

    it('keeps local document chunks as separate results', () => {
        const output = fuseResults({
            responses: [response('q', [
                result('file:///docs/a.md#chunk-0', { engine: 'local-index' }),
                result('file:///docs/a.md#chunk-7', { engine: 'local-index' }),
            ])],
            onlyCurrent: false,
            limit: 0,
        });

        expect(output.display.map(r => r.url)).toEqual([
            'file:///docs/a.md#chunk-0',
            'file:///docs/a.md#chunk-7',
        ]);
    });

    it('truncates the display but leaves the fused ranking whole', () => {
        const results = Array.from({ length: 10 }, (_, i) => result(`https://d${i}.com`));
        const output = fuseResults({
            responses: [response('q', results)],
            onlyCurrent: false,
            limit: 5,
        });

        expect(output.display).toHaveLength(5);
        expect(output.fused).toHaveLength(10);
    });

    it('records one origin per response that produced the result, with that response query', () => {
        const output = fuseResults({
            responses: [
                response('first query', [result('https://a.com', { engine: 'google' })]),
                response('second query', [result('https://a.com', { engine: 'deepseek' })]),
            ],
            onlyCurrent: false,
            limit: 0,
            toolFor: engine => (engine === 'deepseek' ? 'deepseek' : 'digdig'),
        });

        const key = resultUrlKey(output.display[0]);
        const origins = output.originsByKey.get(key)!;
        expect(origins.map(o => o.query)).toEqual(['first query', 'second query']);
        expect(origins.map(o => o.engine)).toEqual(['google', 'deepseek']);
        expect(origins.map(o => o.tool)).toEqual(['digdig', 'deepseek']);
    });

    it('returns an empty result for no responses', () => {
        const output = fuseResults({ responses: [], onlyCurrent: true, limit: 10 });
        expect(output.display).toEqual([]);
        expect(output.fused).toEqual([]);
    });
});
