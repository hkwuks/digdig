import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readSessionJsonInput } from '../../../src/commands/json-input.js';
import { initSessionDir } from '../../../src/deep/session.js';

describe('readSessionJsonInput', () => {
    const directories: string[] = [];

    afterEach(() => {
        while (directories.length > 0) {
            rmSync(directories.pop()!, { recursive: true, force: true });
        }
    });

    it('reads UTF-8 BOM JSON files containing Chinese, newlines, and quotes', () => {
        const directory = mkdtempSync(join(tmpdir(), 'sxng-json-input-'));
        directories.push(directory);
        initSessionDir(directory);
        const file = join(directory, 'agent-inputs', 'exa-results.json');
        writeFileSync(file, `\uFEFF${JSON.stringify([
            { title: '中文 "引号"', content: '第一行\n第二行' },
        ], null, 2)}`, 'utf8');

        const result = readSessionJsonInput(directory, [{ option: '--data-file', value: file, file: true }]);

        expect(result).toEqual({
            ok: true,
            source: '--data-file',
            value: [{ title: '中文 "引号"', content: '第一行\n第二行' }],
        });
    });

    it('rejects missing or multiple JSON input sources before parsing', () => {
        const directory = mkdtempSync(join(tmpdir(), 'sxng-json-input-'));
        directories.push(directory);
        initSessionDir(directory);
        const file = join(directory, 'agent-inputs', 'results.json');
        writeFileSync(file, '[]', 'utf8');
        expect(readSessionJsonInput(directory, [{ option: '--data' }, { option: '--data-file', file: true }]))
            .toMatchObject({ ok: false, code: 'MISSING_JSON_INPUT' });
        expect(readSessionJsonInput(directory, [
            { option: '--data', value: '[]' },
            { option: '--data-file', value: file, file: true },
        ])).toMatchObject({ ok: false, code: 'MULTIPLE_JSON_INPUTS' });
    });

    it('rejects UTF-16 input instead of treating it as malformed UTF-8 JSON', () => {
        const directory = mkdtempSync(join(tmpdir(), 'sxng-json-input-'));
        directories.push(directory);
        initSessionDir(directory);
        const file = join(directory, 'agent-inputs', 'utf16.json');
        writeFileSync(file, Buffer.from([0xff, 0xfe, 0x5b, 0x00, 0x5d, 0x00]));

        expect(readSessionJsonInput(directory, [{ option: '--data-file', value: file, file: true }]))
            .toMatchObject({ ok: false, code: 'UNSUPPORTED_JSON_ENCODING' });
    });

    it('rejects invalid UTF-8 bytes before JSON parsing', () => {
        const directory = mkdtempSync(join(tmpdir(), 'sxng-json-input-'));
        directories.push(directory);
        initSessionDir(directory);
        const file = join(directory, 'agent-inputs', 'invalid-utf8.json');
        writeFileSync(file, Buffer.from([0x5b, 0xff, 0x5d]));

        expect(readSessionJsonInput(directory, [{ option: '--data-file', value: file, file: true }]))
            .toMatchObject({ ok: false, code: 'UNSUPPORTED_JSON_ENCODING' });
    });

    describe('stdin source', () => {
        // `readFileSync(0)` reads the test process's own stdin, so it is swapped
        // here rather than feeding a subprocess. The shapes below are the only
        // thing the function can observe from a pipe.
        let stdinBytes = Buffer.alloc(0);
        const realReadFileSync = readFileSync;
        beforeEach(() => {
            vi.resetModules();
            stdinBytes = Buffer.alloc(0);
        });
        afterEach(() => { vi.doUnmock('fs'); });

        async function withStdin(bytes: Buffer, run: (read: typeof readSessionJsonInput) => void): Promise<void> {
            vi.doMock('fs', async () => ({
                ...await vi.importActual<typeof import('fs')>('fs'),
                readFileSync: (target: unknown, ...rest: unknown[]) => {
                    if (target === 0) {
                        if (stdinBytes.length === 0) throw new Error('EAGAIN');
                        return stdinBytes;
                    }
                    return (realReadFileSync as (...a: unknown[]) => unknown)(target, ...rest);
                },
            }));
            const module = await import('../../../src/commands/json-input.js');
            run(module.readSessionJsonInput);
        }

        it('parses JSON piped on stdin without any session file', async () => {
            const directory = mkdtempSync(join(tmpdir(), 'sxng-json-input-'));
            directories.push(directory);
            initSessionDir(directory);
            stdinBytes = Buffer.from(JSON.stringify([{ url: 'https://example.com', title: 'Example' }]), 'utf8');

            await withStdin(stdinBytes, read => {
                expect(read(directory, [{ option: '--data-stdin', stdin: true }])).toEqual({
                    ok: true, source: '--data-stdin',
                    value: [{ url: 'https://example.com', title: 'Example' }],
                });
            });
        });

        it('reports STDIN_EMPTY rather than INVALID_JSON when nothing is piped', async () => {
            const directory = mkdtempSync(join(tmpdir(), 'sxng-json-input-'));
            directories.push(directory);
            initSessionDir(directory);

            await withStdin(stdinBytes, read => {
                expect(read(directory, [{ option: '--data-stdin', stdin: true }]))
                    .toMatchObject({ ok: false, code: 'STDIN_EMPTY' });
            });
        });

        it('rejects a file and stdin together', async () => {
            const directory = mkdtempSync(join(tmpdir(), 'sxng-json-input-'));
            directories.push(directory);
            initSessionDir(directory);
            const file = join(directory, 'agent-inputs', 'results.json');
            writeFileSync(file, '[]', 'utf8');

            await withStdin(stdinBytes, read => {
                expect(read(directory, [
                    { option: '--data-file', value: file, file: true },
                    { option: '--data-stdin', stdin: true },
                ])).toMatchObject({ ok: false, code: 'MULTIPLE_JSON_INPUTS' });
            });
        });
    });
});
