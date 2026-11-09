import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync, statSync, existsSync } from 'fs';
import { refreshIndex } from '../../src/deep/local-doc/indexer.js';

vi.mock('fs', async importOriginal => ({
  ...await importOriginal<typeof import('fs')>(),
  mkdirSync: vi.fn(), rmSync: vi.fn(), statSync: vi.fn(), existsSync: vi.fn(),
}));

describe('index lock ownership', () => {
  beforeEach(() => vi.resetAllMocks());

  it('preserves another process lock when acquisition fails', async () => {
    vi.mocked(mkdirSync).mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error('exists'); });
    vi.mocked(statSync).mockReturnValue({ mtimeMs: Date.now() } as ReturnType<typeof statSync>);
    await expect(refreshIndex('test-root')).rejects.toMatchObject({ code: 'INDEX_BUSY' });
    expect(rmSync).not.toHaveBeenCalled();
  });

  it('releases its acquired lock when the operation fails', async () => {
    vi.mocked(existsSync).mockImplementation(path => { if (String(path).endsWith('meta.json')) throw new Error('operation failed'); return false; });
    await expect(refreshIndex('test-root')).rejects.toThrow('operation failed');
    expect(rmSync).toHaveBeenCalledOnce();
  });
});
