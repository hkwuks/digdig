import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runPolicyAggregate } from '../../src/commands/review.js';
import { initSessionDir } from '../../src/deep/session.js';

/**
 * `policy-aggregate` returned a JSON envelope whenever there was nothing to
 * aggregate, before it ever looked at the requested format. A caller that asked
 * for markdown got JSON — the same class of mismatch the `-f` fix removed
 * everywhere else.
 */
describe('policy-aggregate empty result honours the format', () => {
  let sessionDir: string;

  async function run(format: string | undefined): Promise<string> {
    const out: string[] = [];
    const log = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { out.push(args.join(' ')); });
    try {
      await runPolicyAggregate(sessionDir, { format });
    } finally {
      log.mockRestore();
    }
    return out.join('\n');
  }

  beforeEach(() => {
    sessionDir = mkdtempSync(join(tmpdir(), 'sxng-policy-'));
    initSessionDir(sessionDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(sessionDir, { recursive: true, force: true });
  });

  it('renders markdown when md is requested and there is nothing to aggregate', async () => {
    const text = await run('md');
    expect(text).toContain('## Policy Aggregate Results');
    expect(text).toContain('No claims with verdicts to aggregate');
    expect(text.trimStart().startsWith('{')).toBe(false);
  });

  it('renders an envelope when json is requested', async () => {
    const text = await run('json');
    expect(JSON.parse(text).status).toBe('ok');
  });

  it('renders an envelope when no format is given', async () => {
    const text = await run(undefined);
    expect(JSON.parse(text).status).toBe('ok');
  });
});
