/**
 * `--data-stdin` through a real pipe.
 *
 * The unit tests swap `readFileSync`, which proves the branch but not the
 * plumbing. This one feeds a real process, because "reads stdin" is exactly the
 * claim that a mock cannot make.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { spawn } from 'child_process';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const cli = resolve('dist/index.js');

let home: string;
let session: string;

beforeAll(async () => {
    if (!existsSync(cli)) throw new Error(`build first: ${cli} is missing (run npm run build in cli/)`);
    home = await mkdtemp(join(tmpdir(), 'dg-stdin-e2e-'));
    session = join(home, 'session');
});
afterAll(async () => { await rm(home, { recursive: true, force: true }); });

function run(cmd: string, args: string[], stdin?: string): Promise<{ stdout: string; stderr: string; code: number }> {
    const child = spawn(process.execPath, [cmd, ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, HOME: home, USERPROFILE: home },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', chunk => out.push(chunk));
    child.stderr.on('data', chunk => err.push(chunk));
    child.stdin.end(stdin ?? '');
    return new Promise((resolveRun, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 60_000);
        child.once('error', reject);
        child.once('close', code => {
            clearTimeout(timer);
            resolveRun({ stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'), code: code ?? 0 });
        });
    });
}

describe('results-add --data-stdin', () => {
    it('imports piped records into a real session', async () => {
        const payload = JSON.stringify([{
            url: 'https://example.com/pipe',
            title: 'Piped Article',
            content: 'Body delivered through a pipe.',
            extractor: 'exa',
            tool: 'exa',
            query: 'piped query',
        }]);

        const added = await run(cli, ['results-add', session, '--kind', 'extracted', '--data-stdin'], payload);
        expect(added.code).toBe(0);
        const envelope = JSON.parse(added.stdout);
        expect(envelope.status).toBe('ok');
        expect(envelope.data).toMatchObject({ added: 1, pendingApproval: 1 });

        // The record is in the session, not merely reported as imported.
        const quality = JSON.parse((await run(cli, ['--session', session, '--quality', '--format', 'json'])).stdout);
        expect(JSON.stringify(quality)).toContain('https://example.com/pipe');
    }, 60_000);

    it('fails before touching the session when stdin is empty', async () => {
        const empty = await run(cli, ['results-add', join(home, 'never-created'), '--kind', 'search', '--data-stdin'], '');
        expect(empty.code).toBe(1);
        expect(JSON.parse(empty.stdout).error.code).toBe('STDIN_EMPTY');
        expect(existsSync(join(home, 'never-created'))).toBe(false);
    }, 60_000);
});
