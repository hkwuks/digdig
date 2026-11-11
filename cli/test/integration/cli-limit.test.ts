import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli } from '../../src/runCli.js';
import { initSessionDir, mutateSessionGraph } from '../../src/deep/session.js';

describe('CLI result limits', () => {
    const root = mkdtempSync(join(tmpdir(), 'digdig-limit-'));
    afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });
    afterAll(() => { rmSync(root, { recursive: true, force: true }); });

    it.each([
        ['graph-search', 'SESSION', '--keyword', 'alpha', '-l', '2', '-f', 'json'],
        ['--limit', '2', 'graph-search', 'SESSION', '--keyword', 'alpha', '-f', 'json'],
        ['graph-search', 'SESSION', '--keyword', 'alpha', '--limit', '2', '-f', 'json'],
    ])('applies the requested limit to real graph-search results: %s', async (...args) => {
        const session = join(root, 'graph');
        initSessionDir(session);
        mutateSessionGraph(session, graph => {
            for (let i = 0; i < 12; i++) graph.mergeNode(`e:${i}`, { type: 'entity', label: `alpha ${i}` });
        });
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        await runCli(args.map(arg => arg === 'SESSION' ? session : arg), {} as never);
        expect(JSON.parse(log.mock.lastCall![0] as string).data.results).toHaveLength(2);
    });

    it.each(['abc', '-5', '0', '2.5', '2abc', '9007199254740992'])('rejects invalid limit %s before search or session creation', async value => {
        const session = join(root, `invalid-${value}`);
        const search = vi.fn();
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        await runCli(['query', '--limit', value, '--session', session, '--format', 'json'], { search } as never);
        expect(process.exitCode).toBe(1);
        expect(JSON.parse(log.mock.lastCall![0] as string).status).toBe('error');
        expect(search).not.toHaveBeenCalled();
        expect(existsSync(session)).toBe(false);
    });

    it.each(['abc', '-5', '0', '2.5'])('rejects invalid graph-search limit %s without creating a session', async value => {
        const session = join(root, `graph-invalid-${value}`);
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        await runCli(['graph-search', session, '--keyword', 'alpha', '--limit', value, '-f', 'json'], {} as never);
        expect(process.exitCode).toBe(1);
        expect(JSON.parse(log.mock.lastCall![0] as string)).toMatchObject({ status: 'error', error: { code: 'INVALID_LIMIT' } });
        expect(existsSync(session)).toBe(false);
    });

    it('retains the graph-search default of ten results', async () => {
        const session = join(root, 'default-graph');
        initSessionDir(session);
        mutateSessionGraph(session, graph => {
            for (let i = 0; i < 12; i++) graph.mergeNode(`e:${i}`, { type: 'entity', label: `alpha ${i}` });
        });
        const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        await runCli(['graph-search', session, '--keyword', 'alpha', '-f', 'json'], {} as never);
        expect(JSON.parse(log.mock.lastCall![0] as string).data.results).toHaveLength(10);
    });

});
