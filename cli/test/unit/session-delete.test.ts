import { afterEach, describe, expect, it, vi } from 'vitest';
import { rmSync } from 'fs';
import { runSessionDelete } from '../../src/commands/session.js';

vi.mock('fs', () => ({
    readFileSync: vi.fn(() => JSON.stringify({ updatedAt: Date.now() - 7200000 })),
    readdirSync: vi.fn(() => [{ name: 'old', isDirectory: () => true }]),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
    rmSync: vi.fn(),
}));

describe('session deletion arguments', () => {
    afterEach(() => vi.restoreAllMocks());

    it.each(['-1', '0', 'abc', '-1junk', 'Infinity', ' '])('rejects %s before deletion', async value => {
        const remove = vi.mocked(rmSync);
        remove.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(await runSessionDelete([], value, '/mock')).toBe(1);
        expect(remove).not.toHaveBeenCalled();
    });

    it('rejects names combined with an age', async () => {
        const remove = vi.mocked(rmSync);
        remove.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(await runSessionDelete(['old'], '1', '/mock')).toBe(1);
        expect(remove).not.toHaveBeenCalled();
    });

    it('accepts a positive fractional age', async () => {
        const remove = vi.mocked(rmSync);
        remove.mockClear();
        vi.spyOn(console, 'log').mockImplementation(() => {});
        expect(await runSessionDelete([], '0.5', '/mock')).toBe(0);
        expect(remove).toHaveBeenCalledOnce();
    });
});
