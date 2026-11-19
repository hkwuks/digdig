/**
 * The external extraction fallback chain must leave a trace.
 *
 * Before this, only defuddle / obscura / jina reported anything. A URL that
 * fell through to exa, tavily or firecrawl — added in 0.1.0 — produced no log
 * line at all, success or failure, so "why is this page empty" could not be
 * answered from the log. These tests pin one `start` and one terminal record
 * per attempt that actually happened.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

const paths = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async importOriginal => ({ ...(await importOriginal<typeof import('os')>()), homedir: () => paths.home }));
vi.mock('dns/promises', () => ({ lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]) }));

const externalExtract = vi.hoisted(() => vi.fn());
vi.mock('../../../src/deep/external-extract.js', async importOriginal => ({
    ...(await importOriginal<typeof import('../../../src/deep/external-extract.js')>()),
    externalExtract,
}));

import { ContentExtractor } from '../../../src/deep/extractor.js';

let home: string;
let log: string;

beforeAll(async () => {
    paths.home = await mkdtemp(resolve('test/extract-fallback-log-'));
    home = paths.home;
    log = join(home, 'digdig', 'logs', 'feedback.jsonl');
});
beforeEach(async () => {
    delete process.env.DIGDIG_LOG;
    externalExtract.mockReset();
    // Tests share one log file; start each from empty so a count means this
    // test's records, not the previous one's. The writer releases its lock
    // asynchronously, so wait for it before truncating.
    for (let attempt = 0; attempt < 100; attempt++) {
        if (!(await stat(join(home, 'digdig', 'logs', '.feedback.lock')).catch(() => null))) break;
        await new Promise(done => setTimeout(done, 20));
    }
    await writeFile(log, '').catch(() => {});
});
afterAll(async () => { await rm(home, { recursive: true, force: true }); });

async function waitForCount(event: string, minimum: number, provider?: string): Promise<void> {
    for (let attempt = 0; attempt < 150; attempt++) {
        const records = (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean)
            .map(line => JSON.parse(line)).filter(record => record.event === event && (provider === undefined || record.provider === provider));
        if (records.length >= minimum) return;
        await new Promise(done => setTimeout(done, 20));
    }
    throw new Error(`only ${minimum} ${event} records did not arrive${provider ? ` for ${provider}` : ''}`);
}

async function records(): Promise<any[]> {
    return (await readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
}

/**
 * Defuddle yields nothing, so extraction falls through to the external chain.
 *
 * A body of any non-blank length is returned before the chain is reached, so
 * the stub has to be a blank page — that is the condition the chain serves.
 */
function stubShortFetch(): void {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body></body></html>')));
}

describe('external fallback chain logging', () => {
    it('records a failed provider and keeps the failure facts bounded', async () => {
        process.env.DIGDIG_LOG = '1';
        stubShortFetch();
        externalExtract.mockResolvedValue('network or timeout error');
        try {
            await new ContentExtractor({ externalKeys: { exa: 'test-key' }, obscura: false }).extract('https://example.com/a');
        } finally { vi.unstubAllGlobals(); }

        await waitForCount('extract_method', 2, 'exa');
        const exa = (await records()).filter(record => record.event === 'extract_method' && record.provider === 'exa');
        expect(exa.map(record => record.status)).toEqual(['start', 'error']);
        expect(exa[1].durationMs).toBeTypeOf('number');
        expect(JSON.stringify(exa)).not.toMatch(/test-key|example\.com/);
    });

    it('records a provider that succeeded', async () => {
        process.env.DIGDIG_LOG = '1';
        stubShortFetch();
        const body = 'E'.repeat(200);
        externalExtract.mockResolvedValue({ title: '', content: body, excerpt: body.slice(0, 200), url: 'https://example.com/b', length: body.length, extractedAt: Date.now(), method: 'exa' });
        try {
            const result = await new ContentExtractor({ externalKeys: { exa: 'test-key' }, obscura: false }).extract('https://example.com/b');
            expect(result.method).toBe('exa');
        } finally { vi.unstubAllGlobals(); }

        await waitForCount('extract_method', 2, 'exa');
        const exa = (await records()).filter(record => record.event === 'extract_method' && record.provider === 'exa');
        expect(exa.map(record => record.status)).toEqual(['start', 'ok']);
        expect(exa[1].durationMs).toBeTypeOf('number');
    });

    it('does not record providers that were never attempted', async () => {
        process.env.DIGDIG_LOG = '1';
        stubShortFetch();
        externalExtract.mockResolvedValue('empty or invalid response');
        try {
            // Only exa has a key; the other four are skipped without a call.
            await new ContentExtractor({ externalKeys: { exa: 'test-key' }, obscura: false }).extract('https://example.com/c');
        } finally { vi.unstubAllGlobals(); }

        await waitForCount('extract_method', 2, 'exa');
        await new Promise(done => setTimeout(done, 80));
        const providers = (await records()).filter(record => record.event === 'extract_method').map(record => record.provider);
        expect(providers).toContain('exa');
        expect(providers).not.toContain('tavily');
        expect(providers).not.toContain('firecrawl');
        expect(providers).not.toContain('ollama');
        expect(providers).not.toContain('deepseek');
        expect(externalExtract).toHaveBeenCalledTimes(1);
    });
});
