/**
 * The bridge is only useful if it fails safely.
 *
 * A PostToolUse hook that rewrites a tool result it misread would replace a
 * real page with a fabricated record, or hide an error. So every test here is
 * as much about what the hook refuses to do as about the happy path.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const execFileAsync = vi.hoisted(() => vi.fn());
vi.mock('child_process', async (importOriginal) => {
    const original = await importOriginal<typeof import('child_process')>();
    const execFile = Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: execFileAsync });
    return { ...original, execFile };
});

import { runHook, type HookInput } from '../../src/hooks/claude-mcp-bridge.js';

let home: string;
let session: string;
let config: string;

/** Exactly what `mcp__exa__web_fetch_exa` returned when probed for real. */
const exaResponse = [{
    type: 'text',
    text: '# Example Domain\nURL: https://example.com\n\nExample Domain\n\nThis domain is for use in documentation examples.',
}];

beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'dg-bridge-'));
    session = join(home, 'session');
    config = join(home, 'mcp-bridge.json');
    await mkdir(session, { recursive: true });
    await writeFile(config, JSON.stringify({
        session,
        tools: { 'mcp__exa__web_fetch_exa': { kind: 'extracted', textPath: '0.text' } },
    }));
    execFileAsync.mockReset().mockResolvedValue({ stdout: JSON.stringify({ status: 'ok', data: { added: 1, updated: 0, total: 1 } }) });
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

function input(overrides: Partial<HookInput> = {}): HookInput {
    return {
        hook_event_name: 'PostToolUse',
        tool_name: 'mcp__exa__web_fetch_exa',
        tool_input: { urls: ['https://example.com'] },
        tool_response: exaResponse,
        cwd: home,
        ...overrides,
    };
}

const env = () => ({ ...process.env, DIGDIG_MCP_BRIDGE_CONFIG: config, DIGDIG_BRIDGE_CLI: '/stub/index.js' }) as NodeJS.ProcessEnv;

describe('claude-mcp-bridge', () => {
    it('replaces the page text with counts, keeping the tool output shape', async () => {
        const outcome = await runHook(input(), env());

        expect(outcome.updatedToolOutput).toEqual([{ type: 'text', text: expect.stringContaining('added 1') }]);
        // A8: the replacement must match the tool's own shape, not be a bare string.
        expect(Array.isArray(outcome.updatedToolOutput)).toBe(true);
        expect(JSON.stringify(outcome.updatedToolOutput)).not.toContain('This domain is for use');
    });

    it('stages the imported record before calling results-add', async () => {
        await runHook(input(), env());

        expect(execFileAsync).toHaveBeenCalledTimes(1);
        const [, args] = execFileAsync.mock.calls[0];
        expect(args).toEqual(['/stub/index.js', 'results-add', session, '--kind', 'extracted', '--data-file', expect.stringContaining('agent-inputs/mcp-')]);
    });

    it('leaves an unmapped tool result completely alone', async () => {
        const outcome = await runHook(input({ tool_name: 'mcp__other__search' }), env());

        expect(outcome).toEqual({});
        expect(execFileAsync).not.toHaveBeenCalled();
    });

    it('leaves the result alone when no config exists', async () => {
        const outcome = await runHook(input({ cwd: join(home, 'nowhere') }), { ...process.env } as NodeJS.ProcessEnv);

        expect(outcome.updatedToolOutput).toBeUndefined();
        expect(outcome.notice).toContain('no config');
        expect(execFileAsync).not.toHaveBeenCalled();
    });

    it('keeps the input file when the import fails', async () => {
        execFileAsync.mockRejectedValue(new Error('boom'));
        const outcome = await runHook(input(), env());

        expect(outcome.updatedToolOutput).toBeUndefined();
        expect(outcome.notice).toContain('input file is kept');
        expect(await readdir(join(session, 'agent-inputs'))).toHaveLength(1);
    });

    it('treats a non-ok envelope as a failed import and keeps the file', async () => {
        execFileAsync.mockResolvedValue({ stdout: JSON.stringify({ status: 'error', error: { code: 'INVALID_RESULTS' } }) });
        const outcome = await runHook(input(), env());

        expect(outcome.updatedToolOutput).toBeUndefined();
        expect(await readdir(join(session, 'agent-inputs'))).toHaveLength(1);
    });

    it('deletes the staged file once the record is in the session', async () => {
        await runHook(input(), env());

        expect(await readdir(join(session, 'agent-inputs'))).toHaveLength(0);
    });

    it('refuses a response it cannot read a url from', async () => {
        const outcome = await runHook(input({ tool_response: [{ type: 'text', text: 'no url here at all' }] }), env());

        expect(outcome.updatedToolOutput).toBeUndefined();
        expect(outcome.notice).toContain('no url/title');
        expect(execFileAsync).not.toHaveBeenCalled();
    });

    it('writes an excerpt rather than a body for search mappings', async () => {
        await writeFile(config, JSON.stringify({
            session,
            tools: { 'mcp__exa__web_fetch_exa': { kind: 'search', textPath: '0.text' } },
        }));
        // A successful import deletes the staged file, so read what was staged
        // from inside the mock rather than from disk afterwards.
        let staged: any[] = [];
        execFileAsync.mockImplementation(async (_bin: string, args: string[]) => {
            staged = JSON.parse(await readFile(args[args.length - 1], 'utf8'));
            return { stdout: JSON.stringify({ status: 'ok', data: { added: 1, updated: 0, total: 1 } }) };
        });
        await runHook(input(), env());

        expect(staged[0]).toMatchObject({ url: 'https://example.com', title: 'Example Domain', tool: 'exa' });
        expect(staged[0].excerpt).toContain('This domain is for use');
        expect(staged[0].content).toBeUndefined();
    });
});
