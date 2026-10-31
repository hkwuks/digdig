/**
 * The classification table, pinned.
 *
 * The defect this file guards: `runSearch`'s catch marked every failure
 * `retryable: true` and hinted at SearXNG, so a DeepSeek 401 — a request that
 * can never succeed — told the caller to retry and to check a server it never
 * contacted.
 *
 * Both directions are asserted on purpose. A test that only checks the
 * retryable cases would still pass with the old hardcoded `true`.
 */
import { describe, it, expect } from 'vitest';
import {
    SearchError,
    codeFromStatus,
    searchErrorFromStatus,
} from '../../src/errors.js';

describe('codeFromStatus', () => {
    it('maps credential failures to AUTH_FAILED', () => {
        expect(codeFromStatus(401)).toBe('AUTH_FAILED');
        expect(codeFromStatus(403)).toBe('AUTH_FAILED');
    });

    it('maps 429 to RATE_LIMITED', () => {
        expect(codeFromStatus(429)).toBe('RATE_LIMITED');
    });

    it('maps 5xx to SERVER_ERROR', () => {
        expect(codeFromStatus(500)).toBe('SERVER_ERROR');
        expect(codeFromStatus(502)).toBe('SERVER_ERROR');
        expect(codeFromStatus(504)).toBe('SERVER_ERROR');
    });

    it('maps other 4xx to BAD_REQUEST', () => {
        expect(codeFromStatus(400)).toBe('BAD_REQUEST');
        expect(codeFromStatus(404)).toBe('BAD_REQUEST');
        expect(codeFromStatus(422)).toBe('BAD_REQUEST');
    });
});

describe('SearchError.retryable', () => {
    it.each([
        ['AUTH_FAILED', false],
        ['BAD_REQUEST', false],
        ['BAD_RESPONSE', false],
        ['RATE_LIMITED', true],
        ['SERVER_ERROR', true],
        ['NETWORK_ERROR', true],
    ] as const)('%s -> retryable %s', (code, expected) => {
        const error = new SearchError(code, 'msg', 'deepseek');
        expect(error.retryable).toBe(expected);
    });

    it('is derived, not stored — a 401 can never be retryable', () => {
        const error = searchErrorFromStatus('deepseek', 401, 'DeepSeek search failed: HTTP 401');
        expect(error.code).toBe('AUTH_FAILED');
        expect(error.retryable).toBe(false);
        expect(error.status).toBe(401);
    });
});

describe('SearchError.hint names the provider that actually failed', () => {
    it('points an auth failure at that provider key, not at SearXNG', () => {
        const deepseek = searchErrorFromStatus('deepseek', 401, 'x').hint;
        expect(deepseek).toContain('DEEPSEEK_API_KEY');
        expect(deepseek).not.toContain('SearXNG');

        const ollama = searchErrorFromStatus('ollama', 403, 'x').hint;
        expect(ollama).toContain('OLLAMA_API_KEY');
        expect(ollama).not.toContain('SearXNG');
    });

    it('mentions SearXNG only for a SearXNG network failure', () => {
        const searxng = new SearchError('NETWORK_ERROR', 'x', 'searxng').hint;
        expect(searxng).toContain('SearXNG');

        const deepseek = new SearchError('NETWORK_ERROR', 'x', 'deepseek').hint;
        expect(deepseek).not.toContain('SearXNG');
    });

    it('tells the caller not to retry an auth failure', () => {
        expect(searchErrorFromStatus('deepseek', 401, 'x').hint).toContain('Retrying will not help');
    });

    it('names the config file key alongside the environment variable', () => {
        expect(searchErrorFromStatus('deepseek', 401, 'x').hint).toContain('deepseekApiKey');
        expect(searchErrorFromStatus('ollama', 401, 'x').hint).toContain('ollamaApiKey');
    });
});

describe('SearchError keeps the message it was given', () => {
    it('does not rewrite the text callers already produced', () => {
        const message = 'DeepSeek search failed: HTTP 401 Authorization Required';
        expect(searchErrorFromStatus('deepseek', 401, message).message).toBe(message);
    });

    it('carries the provider and status as facts', () => {
        const error = searchErrorFromStatus('ollama', 502, 'x');
        expect(error.provider).toBe('ollama');
        expect(error.status).toBe(502);
        expect(error.name).toBe('SearchError');
    });

    it('has no status when there was no response', () => {
        const error = new SearchError('NETWORK_ERROR', 'timeout', 'searxng');
        expect(error.status).toBeUndefined();
    });
});
