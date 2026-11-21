/**
 * A numeric config field that arrives as text must not reach the request layer.
 *
 * `loadConfigFile` returns `JSON.parse`'s output under a `Partial<SearXNGConfig>`
 * annotation. An annotation is an assertion, not a check, so `"timeout": "abc"`
 * was assigned as-is and axios received a string. The environment-variable side
 * already fell back to the default on unparseable input (`readIntEnv`); the file
 * side had no equivalent until this file.
 *
 * Every case here imports the module fresh: `config` is a module-level singleton
 * built at import time, so a second read would hand back the first case's
 * snapshot rather than evaluating the new file.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const saved = { cwd: process.cwd, env: { ...process.env } };

/** An isolated cwd holding one `digdig.config.json`, and an empty HOME. */
function fixture(configFile: unknown): { dir: string; cwd: string; home: string } {
    const dir = mkdtempSync(join(tmpdir(), 'digdig-config-numeric-'));
    const cwd = join(dir, 'cwd');
    const home = join(dir, 'home');
    mkdirSync(cwd, { recursive: true });
    mkdirSync(home, { recursive: true });
    writeFileSync(join(cwd, 'digdig.config.json'), JSON.stringify(configFile));
    vi.resetModules();
    return { dir, cwd, home };
}

async function load(dir: { cwd: string; home: string }) {
    process.cwd = () => dir.cwd;
    process.env.HOME = dir.home;
    process.env.USERPROFILE = dir.home;
    return import('../../src/config.js');
}

beforeEach(() => {
    for (const name of ['DIGDIG_TIMEOUT', 'SEARXNG_TIMEOUT', 'DIGDIG_DEFAULT_LIMIT', 'DIGDIG_REDUNDANCY_THRESHOLD', 'DIGDIG_REDUNDANCY_BIGRAM_THRESHOLD']) {
        delete process.env[name];
    }
});

afterEach(() => {
    process.cwd = saved.cwd;
    process.env = { ...saved.env };
    vi.restoreAllMocks();
});

describe('config file numeric fields', () => {
    it.each([
        ['timeout', 25000],
        ['defaultLimit', 10],
        ['redundancyThreshold', 0.7],
        ['redundancyBigramThreshold', 0.5],
    ])('%s falls back to its default when the file holds a string', async (field, expected) => {
        const fixtureDir = fixture({ [field]: 'abc' });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const { config } = await load(fixtureDir);
            expect((config as Record<string, unknown>)[field]).toBe(expected);
            // Silence would leave the user using a default without knowing it.
            expect(warn).toHaveBeenCalledOnce();
            expect(warn.mock.calls[0][0]).toContain(field);
            expect(warn.mock.calls[0][0]).toContain('abc');
        } finally {
            rmSync(fixtureDir.dir, { recursive: true, force: true });
        }
    });

    it.each([
        ['timeout', 1234],
        ['defaultLimit', 3],
        ['redundancyThreshold', 0.85],
        ['redundancyBigramThreshold', 0.4],
    ])('%s keeps a real number and warns about nothing', async (field, value) => {
        const fixtureDir = fixture({ [field]: value });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const { config } = await load(fixtureDir);
            expect((config as Record<string, unknown>)[field]).toBe(value);
            expect(warn).not.toHaveBeenCalled();
        } finally {
            rmSync(fixtureDir.dir, { recursive: true, force: true });
        }
    });

    it('rejects NaN, Infinity, null and booleans as well as strings', async () => {
        // JSON has no NaN/Infinity literal, so the reachable shapes are the
        // others; `null` and a boolean both pass an `!== undefined` guard.
        const fixtureDir = fixture({ timeout: null, defaultLimit: true });
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            const { config } = await load(fixtureDir);
            expect(config.timeout).toBe(25000);
            expect(config.defaultLimit).toBe(10);
            expect(warn).toHaveBeenCalledTimes(2);
        } finally {
            rmSync(fixtureDir.dir, { recursive: true, force: true });
        }
    });
});
