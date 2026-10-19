/**
 * The rename's compatibility layer: new name wins silently, old name still works
 * and says so once, and nothing about the user's files is ever rewritten.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { deprecate, envRaw, resolveConfigPath, resolveStateRoot, resolveStatePath } from '../../src/legacy.js';

/** Each case gets a fresh process view: announce-once state and env both reset. */
function withIsolatedProcess(env: Record<string, string | undefined>) {
    const saved: Record<string, string | undefined> = {};
    for (const key of ['DIGDIG_NO_DEPRECATION', 'DIGDIG_TIMEOUT', 'SEARXNG_TIMEOUT']) {
        saved[key] = process.env[key];
        if (key in env) {
            if (env[key] === undefined) delete process.env[key];
            else process.env[key] = env[key];
        }
    }
    return () => {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    };
}

describe('legacy compatibility layer', () => {
    let dir: string;
    let restoreEnv: () => void;

    beforeEach(() => {
        dir = mkdtempSync(join(tmpdir(), 'digdig-legacy-'));
        restoreEnv = withIsolatedProcess({});
        // The announce-once set survives within a process, and vitest runs every
        // test in this file in one process, so clear it by re-importing nothing:
        // instead, use a distinct kind per assertion below where it matters.
        vi.restoreAllMocks();
    });

    afterEach(() => {
        restoreEnv();
        rmSync(dir, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    describe('state root', () => {
        it('uses .digdig when nothing exists yet', () => {
            vi.spyOn(process, 'cwd').mockReturnValue(dir);
            expect(resolveStateRoot()).toBe(join(dir, '.digdig'));
        });

        it('prefers an existing .digdig over an existing .sxng without a notice', () => {
            mkdirSync(join(dir, '.digdig'));
            mkdirSync(join(dir, '.sxng'));
            vi.spyOn(process, 'cwd').mockReturnValue(dir);
            const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(resolveStateRoot()).toBe(join(dir, '.digdig'));
            expect(write).not.toHaveBeenCalled();
        });

        it('claims an existing .sxng in place, and only reports it once', () => {
            const legacy = join(dir, '.sxng');
            mkdirSync(join(legacy, 'sessions'), { recursive: true });
            writeFileSync(join(legacy, 'sessions', 'keep.json'), '{"keep":true}');
            vi.spyOn(process, 'cwd').mockReturnValue(dir);
            const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(resolveStateRoot()).toBe(legacy);
            expect(resolveStatePath('sessions')).toBe(join(legacy, 'sessions'));
            expect(resolveStateRoot()).toBe(legacy);

            const notices = write.mock.calls.map(call => String(call[0])).filter(line => line.includes('[deprecation]'));
            expect(notices).toHaveLength(1);
            expect(notices[0]).toContain('0.5.0');
            // Claiming in place means not touching it: the file is still there, unmoved.
            expect(readdirSync(legacy)).toEqual(['sessions']);
            expect(statSync(join(legacy, 'sessions', 'keep.json')).size).toBeGreaterThan(0);
        });
    });

    describe('config path', () => {
        it('prefers ./digdig.config.json over ./sxng.config.json without a notice', () => {
            writeFileSync(join(dir, 'digdig.config.json'), '{}');
            writeFileSync(join(dir, 'sxng.config.json'), '{}');
            vi.spyOn(process, 'cwd').mockReturnValue(dir);
            const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(resolveConfigPath()).toBe(join(dir, 'digdig.config.json'));
            expect(write).not.toHaveBeenCalled();
        });

        it('falls back to ./sxng.config.json and reports it', () => {
            writeFileSync(join(dir, 'sxng.config.json'), '{}');
            vi.spyOn(process, 'cwd').mockReturnValue(dir);
            const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(resolveConfigPath()).toBe(join(dir, 'sxng.config.json'));
            expect(write.mock.calls.some(call => String(call[0]).includes('sxng.config.json'))).toBe(true);
        });
    });

    describe('environment variables', () => {
        it('reads DIGDIG_ silently when both prefixes are set', () => {
            restoreEnv();
            restoreEnv = withIsolatedProcess({ DIGDIG_TIMEOUT: '111', SEARXNG_TIMEOUT: '222' });
            const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(envRaw('TIMEOUT')).toBe('111');
            expect(write).not.toHaveBeenCalled();
        });

        it('falls back to SEARXNG_ and reports it', () => {
            restoreEnv();
            restoreEnv = withIsolatedProcess({ DIGDIG_TIMEOUT: undefined, SEARXNG_TIMEOUT: '222' });
            const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(envRaw('TIMEOUT')).toBe('222');
            expect(write.mock.calls.some(call => String(call[0]).includes('DIGDIG_TIMEOUT'))).toBe(true);
        });

        it('preserves an explicitly empty DIGDIG_ value instead of falling through', () => {
            restoreEnv();
            restoreEnv = withIsolatedProcess({ DIGDIG_TIMEOUT: '', SEARXNG_TIMEOUT: '222' });

            // The new name being present — even empty — is the caller's value; falling
            // through here would silently change what ALLOWED_ENGINES="" means.
            expect(envRaw('TIMEOUT')).toBe('');
        });

        it('never names SEARXNG_SETTINGS_PATH, which belongs to the server', () => {
            // `envRaw` is generic, so the exclusion is the absence of a call. Asserting
            // the call is absent is the only way to encode it; a behaviour test would
            // pass for any variable nobody reads.
            const source = readFileSync(new URL('../../src/config.ts', import.meta.url), 'utf-8');
            expect(source).not.toContain('SETTINGS_PATH');
        });
    });

    describe('notice delivery', () => {
        it('writes to stderr, never stdout', () => {
            const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            // A kind already announced above may be swallowed; assert the channel,
            // not the count, which the announce-once rule owns.
            deprecate('command', 'test notice');

            expect(out).not.toHaveBeenCalled();
            for (const call of err.mock.calls) {
                expect(String(call[0])).not.toContain('"status"');
            }
        });

        it('is silenced by DIGDIG_NO_DEPRECATION without changing resolution', () => {
            restoreEnv();
            restoreEnv = withIsolatedProcess({ DIGDIG_NO_DEPRECATION: '1', SEARXNG_TIMEOUT: '222' });
            const err = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

            expect(envRaw('TIMEOUT')).toBe('222');
            expect(err).not.toHaveBeenCalled();
        });
    });
});
