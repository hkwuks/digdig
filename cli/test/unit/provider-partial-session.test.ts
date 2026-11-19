import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../../src/deep/session.js', async original => {
    const actual = await original<typeof import('../../src/deep/session.js')>();
    const { SessionStateError } = await import('../../src/deep/session-lock.js');
    return { ...actual, recordSuccessfulQuery: () => { throw new SessionStateError('SESSION_BUSY', 'busy'); } };
});
import { runCli } from '../../src/runCli.js';
import { config } from '../../src/config.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('returns already obtained results when a session write fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'digdig-partial-'));
    const oldBase = config.baseUrl;
    const oldAllowed = config.allowedEngines;
    config.baseUrl = ''; config.allowedEngines = [];
    vi.stubEnv('EXA_API_KEY', 'fake-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ results: [{ title: 'Page', url: 'https://example.com' }] })));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    try {
        await runCli(['q', '-e', 'exa', '--session', join(root, 'session'), '--format', 'json'], {} as never);
        const envelope = JSON.parse(log.mock.lastCall![0]);
        expect(envelope.error.code).toBe('SESSION_BUSY');
        expect(envelope.error.details.sessionWrite).toBe('unconfirmed');
        expect(envelope.error.details.partialResults).toEqual(expect.arrayContaining([expect.objectContaining({ url: 'https://example.com', engine: 'exa' })]));
        expect(envelope.error.details.providerResults).toEqual(expect.arrayContaining([expect.objectContaining({ provider: 'exa', status: 'ok', returned: 1 })]));
    } finally { config.baseUrl = oldBase; config.allowedEngines = oldAllowed; rmSync(root, { recursive: true, force: true }); }
});
