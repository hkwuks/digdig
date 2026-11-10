import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli } from '../../src/runCli.js';
import { appendSessionResults, initSessionDir } from '../../src/deep/session.js';

describe('read-only session commands', () => {
  let root: string;
  let previousExit: typeof process.exitCode;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'digdig-readonly-'));
    previousExit = process.exitCode;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.exitCode = previousExit;
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  it.each([
    (session: string) => ['session-report', session],
    (session: string) => ['suggest-queries', session],
    (session: string) => ['graph-preprocess', session],
    (session: string) => ['--session', session, '--quality'],
  ])('rejects a missing session without creating it', async args => {
    const missing = join(root, 'missing');
    await runCli(args(missing), {} as never);
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ error: { code: 'EMPTY_SESSION' } });
    expect(existsSync(missing)).toBe(false);
  });

  it.each([
    (session: string) => ['session-report', session],
    (session: string) => ['suggest-queries', session],
    (session: string) => ['graph-preprocess', session],
    (session: string) => ['--session', session, '--quality'],
  ])('rejects an existing empty session', async args => {
    const empty = join(root, 'empty');
    initSessionDir(empty);
    await runCli(args(empty), {} as never);
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ error: { code: 'EMPTY_SESSION' } });
    expect(existsSync(join(empty, 'graph.json'))).toBe(false);
  });

  it.each(['session-report', 'suggest-queries', 'graph-preprocess'])('supports populated sessions in %s', async command => {
    const session = join(root, 'existing');
    initSessionDir(session);
    appendSessionResults(session, [{ url: 'https://example.com', title: 'Example', origins: [{ tool: 'digdig', query: 'q' }] }]);
    await runCli([command, session], {} as never);
    expect(process.exitCode).toBe(0);
  });

  it('supports quality for a populated session', async () => {
    const session = join(root, 'existing');
    initSessionDir(session);
    appendSessionResults(session, [{ url: 'https://example.com', title: 'Example', origins: [{ tool: 'digdig', query: 'q' }] }]);
    await runCli(['--session', session, '--quality'], {} as never);
    expect(process.exitCode).toBe(0);
  });

  it('does not add a misspelled named session to session-list', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(root);
    await runCli(['session-list'], {} as never);
    const before = JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data.sessions;
    await runCli(['session-report', 'misspelled'], {} as never);
    expect(process.exitCode).toBe(1);
    await runCli(['session-list'], {} as never);
    expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0]).data.sessions).toEqual(before);
    expect(existsSync(join(root, '.digdig', 'sessions', 'misspelled'))).toBe(false);
  });
});
