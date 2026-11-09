import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../../src/runCli.js';

describe('session-delete CLI validation', () => {
    afterEach(() => { vi.restoreAllMocks(); process.exitCode = 0; });

    it.each([['--older', '-1junk'], ['--older', '0'], ['name', '--older', 'abc'], ['name', '--older', '1']])(
        'rejects invalid arguments %s', async (...args) => {
            const output = vi.spyOn(console, 'log').mockImplementation(() => {});
            await createProgram().parseAsync(['node', 'dg', 'session-delete', ...args]);
            expect(process.exitCode).toBe(1);
            expect(JSON.parse(output.mock.calls[0][0])).toMatchObject({ status: 'error', error: { code: 'INVALID_ARGUMENT' } });
        },
    );
});
