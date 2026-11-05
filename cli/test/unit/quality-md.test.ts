import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runCli } from '../../src/runCli.js';
import { SearXNGService } from '../../src/service.js';
import { appendSessionResults, approveResults, initSessionDir, injectApprovedResults, loadSessionResults } from '../../src/deep/session.js';

/**
 * `--quality -f md` used to drop the result id and revision from its table
 * while its own footer told the Agent to write id/revision selections. The
 * markdown has to carry what the next step needs, or it is not an output the
 * Agent can act on — cheaper per token or not.
 *
 * `--quality` is a root-command option whose action is registered by `runCli`,
 * not by `createProgram`, so the entry point under test is `runCli`.
 */
describe('--quality markdown output', () => {
  let sessionDir: string;

  async function runQuality(fmt: string): Promise<string> {
    const out: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { out.push(args.join(' ')); });
    try {
      await runCli(['--session', sessionDir, '--quality', '-f', fmt], new SearXNGService());
    } finally {
      log.mockRestore();
    }
    return out.join('\n');
  }

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-quality-'));
    initSessionDir(sessionDir);
    appendSessionResults(sessionDir, [
      { url: 'https://example.com/a', title: 'A', contentType: 'extracted', content: 'Body A is long enough to verify.', extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'q1' }] },
      { url: 'https://example.com/b', title: 'B', contentType: 'extracted', content: 'Body B is long enough to verify.', extractor: 'defuddle', origins: [{ tool: 'sxng', query: 'q2' }] },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it('puts the result id and revision in the table', async () => {
    const pending = loadSessionResults(sessionDir);
    const text = await runQuality('md');

    expect(text).toContain('| ID |');
    expect(text).toContain('| Rev |');
    for (const result of pending) {
      expect(text).toContain(result.id);
    }
  });

  it('lets the Agent approve using only what the markdown table shows', async () => {
    const text = await runQuality('md');
    // Parse the table exactly as a reader would: split cells, take ID and Rev.
    const rows = text.split('\n').filter(line => line.startsWith('| ') && line.includes('r:'));
    expect(rows.length).toBeGreaterThan(0);

    const selections = rows.map(row => {
      const cells = row.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim());
      return { id: cells[1], revision: Number(cells[2]) };
    });

    mkdirSync(join(sessionDir, 'agent-inputs'), { recursive: true });
    const file = join(sessionDir, 'agent-inputs', 'approve.json');
    writeFileSync(file, JSON.stringify(selections), 'utf8');

    const approved = approveResults(sessionDir, selections);
    expect(approved.error).toBeUndefined();
    expect(approved.approved).toBe(selections.length);
    injectApprovedResults(sessionDir, approved.approvedResults);
  });

  it('still emits an envelope for -f json', async () => {
    const text = await runQuality('json');
    const parsed = JSON.parse(text);
    expect(parsed.status).toBe('ok');
  });
});
