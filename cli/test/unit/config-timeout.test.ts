/**
 * The request timeout the CLI ships with, and the one `dg init` is willing to write.
 *
 * Both numbers exist to stay above SearXNG's own `outgoing.max_request_timeout`:
 * a client that gives up first turns a healthy server into a `NETWORK_ERROR`,
 * and the user has no way to tell the two apart. Pinning the value alone would
 * not catch a half-fix, so the assertions read the shipped artifacts — the
 * config module, the init module, the example file and the three READMEs —
 * rather than a constant copied into the test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/** Re-import `config.js` with cwd and HOME pointed at an empty tree. */
async function freshConfig() {
    const dir = mkdtempSync(join(tmpdir(), 'digdig-timeout-'));
    const home = join(dir, 'home');
    mkdirSync(home, { recursive: true });
    const cwd = join(dir, 'cwd');
    mkdirSync(cwd, { recursive: true });
    // `config` is a module-level singleton built at import time, so reading it
    // again in a later test would hand back the first test's snapshot. Each
    // case has to evaluate the module under its own environment.
    vi.resetModules();
    return { dir, home, cwd };
}

const saved = { cwd: process.cwd, env: { ...process.env } };

beforeEach(() => {
    delete process.env.DIGDIG_TIMEOUT;
    delete process.env.SEARXNG_TIMEOUT;
});

afterEach(() => {
    process.cwd = saved.cwd;
    process.env = { ...saved.env };
});

describe('digdig request timeout default', () => {
    it('defaults to 25000 when no config file and no env var are present', async () => {
        const { dir, home, cwd } = await freshConfig();
        process.cwd = () => cwd;
        process.env.HOME = home;
        process.env.USERPROFILE = home;
        const { config } = await import('../../src/config.js');
        expect(config.timeout).toBe(25000);
        rmSync(dir, { recursive: true, force: true });
    });

    it('keeps an explicit values below the default instead of raising it', async () => {
        const { dir, home, cwd } = await freshConfig();
        process.cwd = () => cwd;
        process.env.HOME = home;
        process.env.USERPROFILE = home;
        process.env.DIGDIG_TIMEOUT = '3000';
        const { config } = await import('../../src/config.js');
        expect(config.timeout).toBe(3000);
        rmSync(dir, { recursive: true, force: true });
    });

    it('init and config ship the same default', async () => {
        const { dir, home, cwd } = await freshConfig();
        process.cwd = () => cwd;
        process.env.HOME = home;
        process.env.USERPROFILE = home;
        const { config } = await import('../../src/config.js');
        const initSource = readFileSync(new URL('../../src/init.ts', import.meta.url), 'utf8');
        const match = initSource.match(/timeout:\s*(\d+),/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe(config.timeout);
        rmSync(dir, { recursive: true, force: true });
    });

    it('init refuses to write a timeout below SearXNG max_request_timeout', () => {
        const initSource = readFileSync(new URL('../../src/init.ts', import.meta.url), 'utf8');
        // The interactive floor: `Math.max(<floor>, parseInt(...) || <fallback>)`.
        const match = initSource.match(/config\.timeout\s*=\s*Math\.max\((\d+),\s*parseInt\([^)]*\)\s*\|\|\s*(\d+)\)/);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe(12000);
        expect(Number(match![2])).toBe(25000);
    });

    it('the example config ships 25000', () => {
        const example = JSON.parse(readFileSync(new URL('../../digdig.config.example.json', import.meta.url), 'utf8'));
        expect(example.timeout).toBe(25000);
    });
});

describe('documented timeout default', () => {
    const repo = new URL('../../../', import.meta.url);

    it.each([
        ['README.md', /`DIGDIG_TIMEOUT` \| Request timeout in ms \| `(\d+)`/],
        ['README.zh-CN.md', /`DIGDIG_TIMEOUT` \| 请求超时时间（毫秒） \| `(\d+)`/],
        ['cli/README.md', /`DIGDIG_TIMEOUT` \| Request timeout in ms \| `(\d+)`/],
    ])('%s publishes 25000 in its env table', (file, pattern) => {
        const source = readFileSync(new URL(file, repo), 'utf8');
        const match = source.match(pattern);
        expect(match).not.toBeNull();
        expect(Number(match![1])).toBe(25000);
    });

    it.each([
        ['README.md', '`"timeout": 10000`'],
        ['README.zh-CN.md', '`"timeout": 10000`'],
        ['cli/README.md', '`"timeout": 10000`'],
    ])('%s publishes 25000 in its config example', (file, stale) => {
        const source = readFileSync(new URL(file, repo), 'utf8');
        expect(source).not.toContain(stale);
        expect(source).toContain('"timeout": 25000');
    });

    it('both READMEs recommend the same SearXNG outgoing timeouts', () => {
        const en = readFileSync(new URL('README.md', repo), 'utf8');
        const zh = readFileSync(new URL('README.zh-CN.md', repo), 'utf8');
        const outgoing = (source: string) => {
            const block = source.replace(/\r\n/g, '\n').match(/outgoing:\n(?:.*\n)*?\s+request_timeout: ([\d.]+)[^\n]*\n\s+max_request_timeout: ([\d.]+)/);
            expect(block).not.toBeNull();
            return { request: block![1], max: block![2] };
        };
        expect(outgoing(zh)).toEqual(outgoing(en));
        expect(outgoing(en)).toEqual({ request: '10.0', max: '25.0' });
    });
});
