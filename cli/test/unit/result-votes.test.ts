/**
 * The two facts the SearXNG adapter used to drop on the floor.
 *
 * SearXNG returns `engines` and `positions` as parallel arrays on every result
 * and reports unresponsive engines as `[name, reason]` pairs. The mapping kept
 * only `engine` and only the name, which left the fusion score unexplainable
 * and an outage indistinguishable from a hiccup. These tests pin the pairing
 * rules, including the case where pairing them would be a guess.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';

vi.mock('axios');

const mockedAxios = vi.mocked(axios, true);

function searchResponse(results: unknown[], unresponsive: unknown[] = []) {
    return {
        data: {
            query: 'q',
            numberOfResults: results.length,
            results,
            suggestions: [],
            answers: [],
            corrections: [],
            infoboxes: [],
            unresponsive_engines: unresponsive,
        },
    };
}

function rawResult(overrides: Record<string, unknown> = {}) {
    return {
        title: 'T',
        url: 'https://example.com/a',
        content: 'body text',
        engine: 'bing',
        engines: ['bing'],
        positions: [1],
        category: 'general',
        ...overrides,
    };
}

async function search(results: unknown[], unresponsive: unknown[] = []) {
    const { SearXNGService } = await import('../../src/service.js');
    const service = new SearXNGService();
    mockedAxios.create = vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue(searchResponse(results, unresponsive)),
    }) as never;
    // The constructor already ran with the real create; rebuild after mocking.
    const rebuilt = new SearXNGService();
    return rebuilt.search({ query: 'q' });
}

describe('SearXNG result votes', () => {
    beforeEach(() => {
        vi.resetModules();
        mockedAxios.isAxiosError = vi.fn().mockReturnValue(false) as never;
    });

    it('pairs engines with their positions when two engines agree', async () => {
        const response = await search([
            rawResult({ engines: ['bing', 'brave'], positions: [1, 2] }),
        ]);

        expect(response.results[0].votes).toEqual([
            { engine: 'bing', position: 1 },
            { engine: 'brave', position: 2 },
        ]);
    });

    it('keeps a single-engine vote rather than dropping it', async () => {
        const response = await search([
            rawResult({ engines: ['bing'], positions: [3] }),
        ]);

        expect(response.results[0].votes).toEqual([{ engine: 'bing', position: 3 }]);
    });

    it('omits votes entirely when the two arrays disagree in length', async () => {
        // Pairing past this would attach an engine to a rank it never gave, and
        // the output would look authoritative while being wrong.
        const response = await search([
            rawResult({ engines: ['bing', 'brave'], positions: [1] }),
        ]);

        expect(response.results[0].votes).toBeUndefined();
    });

    it('omits votes when a rank is present but belongs to nothing', async () => {
        // Longer `positions` is the case the per-element type check cannot catch:
        // every position read is a number, so a naive loop would emit a vote with
        // an undefined engine for the trailing rank.
        const response = await search([
            rawResult({ engines: ['bing'], positions: [1, 2] }),
        ]);

        expect(response.results[0].votes).toBeUndefined();
    });

    it('omits votes when positions are absent', async () => {
        const response = await search([
            rawResult({ engines: ['bing'], positions: undefined }),
        ]);

        expect(response.results[0].votes).toBeUndefined();
    });

    it('keeps the single engine field alongside votes', async () => {
        const response = await search([
            rawResult({ engine: 'bing', engines: ['bing', 'brave'], positions: [1, 2] }),
        ]);

        expect(response.results[0].engine).toBe('bing');
        expect(response.results[0].votes).toHaveLength(2);
    });
});

describe('SearXNG unresponsive engines', () => {
    beforeEach(() => {
        vi.resetModules();
        mockedAxios.isAxiosError = vi.fn().mockReturnValue(false) as never;
    });

    it('keeps the reason alongside the engine name', async () => {
        const response = await search(
            [rawResult()],
            [['duckduckgo', 'CAPTCHA'], ['google', 'Suspended: access denied']]
        );

        expect(response.unresponsiveEngines).toEqual([
            { engine: 'duckduckgo', reason: 'CAPTCHA' },
            { engine: 'google', reason: 'Suspended: access denied' },
        ]);
    });

    it('accepts a bare string and records an empty reason', async () => {
        const response = await search([rawResult()], ['brave']);

        expect(response.unresponsiveEngines).toEqual([{ engine: 'brave', reason: '' }]);
    });

    it('drops entries with no engine name', async () => {
        const response = await search([rawResult()], [['', 'no name'], ['bing', 'ok']]);

        expect(response.unresponsiveEngines).toEqual([{ engine: 'bing', reason: 'ok' }]);
    });
});
