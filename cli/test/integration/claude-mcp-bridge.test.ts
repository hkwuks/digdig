/**
 * End to end: a real MCP result reaches a real session database.
 *
 * The unit tests stub `results-add`; this one runs it, because the thing that
 * can silently break is the handoff between two processes — the hook writing a
 * file the CLI will accept, and the CLI reporting a shape the hook can read.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const exec = promisify(execFile);
const cli = resolve('dist/index.js');

let home: string;
let session: string;
let config: string;

/** The shape `mcp__exa__web_fetch_exa` actually returned when probed. */
const response = [{
    type: 'text',
    text: '# Example Domain\nURL: https://example.com\n\nExample Domain\n\nThis domain is for use in documentation examples.',
}];

beforeAll(async () => {
    // Say so plainly instead of failing later with an empty stdout, which the
    // CI run that shipped this test first reported as "Unexpected end of JSON".
    if (!existsSync(cli)) throw new Error(`build first: ${cli} is missing (run npm run build in cli/)`);
    home = await mkdtemp(join(tmpdir(), 'dg-bridge-e2e-'));
    session = join(home, 'session');
    config = join(home, 'mcp-bridge.json');
    await mkdir(session, { recursive: true });
    await writeFile(config, JSON.stringify({
        session,
        tools: { 'mcp__exa__web_fetch_exa': { kind: 'extracted', textPath: '0.text' } },
    }));
});
afterAll(async () => { await rm(home, { recursive: true, force: true }); });

/**
 * Run a command, optionally feeding it stdin.
 *
 * `execFile` has no stdin option (only `execFileSync` does), so the hook — which
 * reads stdin to completion — is driven through `spawn`.
 */
async function run(cmd: string, args: string[], stdin?: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const child = spawn(process.execPath, [cmd, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        // The hook resolves its config from this variable; without it, it
        // looks for `.digdig/mcp-bridge.json` under the CLI's cwd.
        env: { ...process.env, DIGDIG_MCP_BRIDGE_CONFIG: config },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.stdin.end(stdin ?? '');
    const code = await new Promise<number>((resolveCode, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 60_000);
        child.once('error', reject);
        child.once('close', resolved => { clearTimeout(timer); resolveCode(resolved ?? 0); });
    });
    return { stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), code };
}

describe('bridge end to end', () => {
    it('puts the body in the session and only counts in the model-visible output', async () => {
        const { stdout } = await run(join('dist', 'hooks', 'claude-mcp-bridge.js'), [], JSON.stringify({
            hook_event_name: 'PostToolUse',
            tool_name: 'mcp__exa__web_fetch_exa',
            tool_input: { urls: ['https://example.com'] },
            tool_response: response,
        }));

        const emitted = JSON.parse(stdout);
        expect(emitted.hookSpecificOutput.updatedToolOutput[0].type).toBe('text');
        // A2: the page body must not reach the model through the replacement.
        expect(stdout).not.toContain('This domain is for use');
        expect(emitted.hookSpecificOutput.updatedToolOutput[0].text).toContain('added 1');

        // A3: the body is now in the session, visible to --quality.
        const quality = JSON.parse((await run(cli, ['--session', session, '--quality', '--format', 'json'])).stdout);
        const stored = JSON.stringify(quality);
        expect(stored).toContain('https://example.com');
        expect(stored).toMatch(/"?extracted"?\s*[:=]\s*true/);
    }, 60_000);
});
