import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/runCli.js';
import { appendSessionResults, initSessionDir } from '../../src/deep/session.js';

/**
 * `-f, --format` is declared on the root program AND on each subcommand, so
 * Commander assigns it to the parent and `opts.format` is always undefined.
 * These tests pin the two things that keep the flag working: the action reads
 * `command.optsWithGlobals().format`, and every subcommand still advertises the
 * flag in its own `--help`.
 */

/** Run a program built by createProgram and capture what it printed. */
async function run(argv: string[]): Promise<string> {
  const out: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { out.push(args.join(' ')); });
  try {
    await createProgram(argv).parseAsync(argv, { from: 'user' });
  } finally {
    log.mockRestore();
  }
  return out.join('\n');
}

let sessionDir: string;

beforeEach(() => {
  sessionDir = mkdtempSync(join(tmpdir(), 'sxng-format-'));
  initSessionDir(sessionDir);
  appendSessionResults(sessionDir, [{ url: 'https://example.com', title: 'Example', origins: [{ tool: 'digdig', query: 'q' }] }]);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(sessionDir, { recursive: true, force: true });
});

describe('subcommand --format flag ownership', () => {
  it('renders markdown for a default-json command when -f md follows the subcommand', async () => {
    const text = await run(['session-report', sessionDir, '-f', 'md']);
    expect(text).toContain('## Session Report');
    expect(text.trimStart().startsWith('{')).toBe(false);
  });

  it('renders markdown when -f md precedes the subcommand', async () => {
    const text = await run(['-f', 'md', 'session-report', sessionDir]);
    expect(text).toContain('## Session Report');
  });

  it('renders json for a default-md command when -f json is given', async () => {
    const text = await run(['graph-search', sessionDir, '--keyword', 'x', '-f', 'json']);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('renders markdown for a default-md command with no -f at all', async () => {
    const text = await run(['graph-search', sessionDir, '--keyword', 'x']);
    expect(text).toContain('## Search:');
  });

  it('keeps every subcommand that declared -f still advertising it', () => {
    // Eight subcommands never declared `-f` (init, extract, graph-add,
    // results-add, doc-index, doc-search, session-list, session-delete) — this
    // task does not add it to them, and must not take it away from the rest.
    const program = createProgram([]);
    const declared = program.commands.filter(sub => sub.options.map(option => option.flags).join(' ').includes('-f, --format'));
    expect(declared.length).toBe(19);
  });

  it('keeps the root command advertising -f', () => {
    const program = createProgram([]);
    expect(program.options.map(option => option.flags).join(' ')).toContain('-f, --format');
  });

  it('exposes -f on the subcommand object itself, not only on the parent', () => {
    const program = createProgram([]);
    const report = program.commands.find(command => command.name() === 'session-report');
    expect(report).toBeDefined();
    expect(report!.options.map(option => option.flags).join(' ')).toContain('-f, --format');
  });
});

describe('format resolution stays per-command', () => {
  it('reports json for session-report with no -f, preserving its existing default', async () => {
    const text = await run(['session-report', sessionDir]);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('reports markdown for graph-search with no -f, preserving its existing default', async () => {
    const text = await run(['graph-search', sessionDir, '--keyword', 'x']);
    expect(text).toContain('## Search:');
  });
});

describe('program construction', () => {
  it('does not throw for an empty argv', () => {
    expect(() => createProgram([])).not.toThrow();
    expect(createProgram([])).toBeInstanceOf(Command);
  });
});
