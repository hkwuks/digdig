/**
 * The log's vocabulary must track the code's, not a hand-copied list.
 *
 * These tests assert the drift that actually happened rather than the general
 * idea of it: three of four session codes recording as `unknown`, four
 * distinct validation failures recording as one string, and the extraction
 * fallback chain recording nothing at all.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { join, resolve } from 'path';

const paths = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async importOriginal => ({ ...(await importOriginal<typeof import('os')>()), homedir: () => paths.home }));

import { feedbackError, feedbackLog } from '../../src/feedback-log.js';
import { SEARCH_ERROR_CODES, SEARCH_PROVIDERS } from '../../src/errors.js';
import { SESSION_ERROR_CODES, SessionStateError } from '../../src/deep/session-lock.js';

let home: string;
let log: string;

beforeAll(async () => {
    paths.home = await mkdtemp(resolve('test/feedback-vocab-'));
    home = paths.home;
    log = join(home, 'digdig', 'logs', 'feedback.jsonl');
});
beforeEach(() => { delete process.env.DIGDIG_LOG; });
afterAll(async () => { await rm(home, { recursive: true, force: true }); });

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await predicate()) return;
        await new Promise(done => setTimeout(done, 20));
    }
    throw new Error('log write timed out');
}

describe('feedbackError', () => {
    it.each(SESSION_ERROR_CODES)('classifies %s as itself, not as unknown', code => {
        expect(feedbackError(new SessionStateError(code, 'detail suppressed'))).toBe(code);
    });

    it('still classifies every search error code', () => {
        const sample = { CONFIG_MISSING: 'x', AUTH_FAILED: 'x', RATE_LIMITED: 'x', SERVER_ERROR: 'x', NETWORK_ERROR: 'x', BAD_REQUEST: 'x', BAD_RESPONSE: 'x' } as const;
        for (const code of SEARCH_ERROR_CODES) expect(feedbackError({ code: sample[code] && code })).toBe(code);
    });

    it('falls back to unknown for anything unclassified', () => {
        expect(feedbackError(new Error('no code'))).toBe('unknown');
        expect(feedbackError({ code: 'NOT_A_REAL_CODE' })).toBe('unknown');
    });
});

describe('vocabulary', () => {
    it('records every search provider the classifier knows', async () => {
        process.env.DIGDIG_LOG = '1';
        for (const provider of SEARCH_PROVIDERS) feedbackLog('provider', 'start', { provider });
        await waitFor(async () => (await readFile(log, 'utf8').catch(() => '')).split('\n').filter(Boolean).length >= SEARCH_PROVIDERS.length);
        const recorded = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).map(record => record.provider);
        expect(recorded).toEqual(expect.arrayContaining([...SEARCH_PROVIDERS]));
    });

    it('refuses a provider the classifier does not know', async () => {
        process.env.DIGDIG_LOG = '1';
        feedbackLog('provider', 'ok', { provider: 'invented-provider' } as never);
        await waitFor(async () => (await readFile(log, 'utf8').catch(() => '')).includes('invented-provider') === false);
        await new Promise(done => setTimeout(done, 80));
        expect(await readFile(log, 'utf8').catch(() => '')).not.toContain('invented-provider');
    });
});

describe('validation failures', () => {
    it('records the envelope code instead of a single validation string', async () => {
        process.env.DIGDIG_LOG = '1';
        const { config } = await import('../../src/config.js');
        const { runCli } = await import('../../src/runCli.js');
        const output = vi.spyOn(console, 'log').mockImplementation(() => {});
        const previousBase = config.baseUrl;
        config.baseUrl = 'https://vocab-test.example';
        try {
            await runCli(['too many', '-l', '0', '--format', 'json']);
            await runCli([], { format: 'json' } as never);
        } finally {
            config.baseUrl = previousBase;
            output.mockRestore();
        }
        // Both codes are enqueued asynchronously; wait for the second one
        // rather than the first, so the read below cannot race the writer.
        await waitFor(async () => {
            const seen = (await readFile(log, 'utf8').catch(() => ''));
            return seen.includes('"INVALID_LIMIT"') && seen.includes('"MISSING_QUERY"');
        });
        const records = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(record => record.event === 'validation' && record.status === 'error');
        const codes = records.map(record => record.error);
        expect(codes).toContain('INVALID_LIMIT');
        expect(codes).toContain('MISSING_QUERY');
        expect(codes).not.toContain('validation');
    });
});
