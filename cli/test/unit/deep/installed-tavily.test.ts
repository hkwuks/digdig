import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
beforeEach(() => vi.stubEnv('PATH', ''));
afterEach(() => vi.unstubAllEnvs());
const execute = vi.hoisted(() => vi.fn());
vi.mock('child_process', () => ({ execFile: Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: execute }) }));
import { installedTavilyExtract, installedTavilyReady, installedTavilySearch, installedTavilyStatus } from '../../../src/deep/installed-tavily.js';

describe('installed Tavily', () => {
    it('recognizes a working CLI and rejects a broken installation', async () => {
        execute.mockReset().mockResolvedValueOnce({ stdout: JSON.stringify({ version: '1.0.1', authenticated: true }) })
            .mockResolvedValueOnce({ stdout: 'not JSON' }).mockRejectedValueOnce(new Error('missing interpreter'));
        expect(await installedTavilyReady()).toBe(true);
        expect(await installedTavilyReady()).toBe(false);
        expect(await installedTavilyReady()).toBe(false);
    });
    it('reports missing, broken, and keyless CLI states separately', async () => {
        execute.mockReset().mockRejectedValueOnce(Object.assign(new Error('not found'), { code: 'ENOENT' }))
            .mockRejectedValueOnce(new Error('broken')).mockResolvedValueOnce({ stdout: JSON.stringify({ version: '1.0.1', authenticated: false }) });
        expect(await installedTavilyStatus()).toBe('not_installed');
        expect(await installedTavilyStatus()).toBe('unavailable');
        expect(await installedTavilyStatus()).toBe('keyless');
    });
    it('recognizes the supported keyless mode', async () => {
        execute.mockReset().mockResolvedValue({ stdout: JSON.stringify({ version: '1.0.1', authenticated: false }) });
        expect(await installedTavilyReady()).toBe(true);
    });
    it.skipIf(process.platform !== 'win32')('uses the npm package entry directly on Windows', async () => {
        const root = mkdtempSync(join(process.cwd(), '.tavily-test-'));
        const pkg = join(root, 'node_modules', '@tavily', 'cli');
        try {
            mkdirSync(join(pkg, 'dist'), { recursive: true });
            writeFileSync(join(root, 'tvly.cmd'), 'shim');
            writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: '@tavily/cli', bin: { tvly: 'dist/cli.js' } }));
            writeFileSync(join(pkg, 'dist', 'cli.js'), '');
            vi.stubEnv('PATH', root);
            execute.mockReset().mockResolvedValue({ stdout: JSON.stringify({ version: '1.0.1', authenticated: true }) });
            expect(await installedTavilyReady()).toBe(true);
            expect(execute).toHaveBeenCalledWith(process.execPath, [join(pkg, 'dist', 'cli.js'), '--status', '--json'], expect.any(Object));
        } finally { rmSync(root, { recursive: true, force: true }); }
    });
    it('passes URLs as arguments without a shell and reads structured output', async () => {
        execute.mockReset().mockResolvedValue({ stdout: JSON.stringify({ results: [{ raw_content: 'Body' }] }) });
        const result = await installedTavilyExtract('https://example.com/?a=1&b=2', 1000);
        expect(result).toMatchObject({ method: 'tavily', content: 'Body' });
        expect(execute).toHaveBeenCalledWith('tvly', ['extract', 'https://example.com/?a=1&b=2', '--json'], expect.objectContaining({ timeout: 1000 }));
    });
    it('searches through an authenticated CLI without shell interpolation', async () => {
        execute.mockReset().mockResolvedValue({ stdout: JSON.stringify({ results: [{ title: 'Page', url: 'https://example.com', content: 'snippet' }] }) });
        const result = await installedTavilySearch('search & more', 50);
        expect(result.results[0]).toMatchObject({ engine: 'tavily', content: 'snippet' });
        expect(execute).toHaveBeenCalledWith('tvly', ['search', 'search & more', '--json', '--max-results', '20'], expect.any(Object));
    });

});
