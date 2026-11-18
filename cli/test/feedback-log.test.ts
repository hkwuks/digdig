import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

const paths = vi.hoisted(() => ({ home: '' }));
vi.mock('os', async importOriginal => ({ ...await importOriginal<typeof import('os')>(), homedir: () => paths.home }));
import { feedbackLog } from '../src/feedback-log.js';

let dir: string;
let log: string;
async function waitFor(check: () => Promise<boolean>): Promise<void> {
    for (let i = 0; i < 100; i++) {
        if (await check()) return;
        await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('log write timed out');
}
beforeAll(async () => {
    paths.home = await mkdtemp(resolve('test/feedback-log-'));
    dir = join(paths.home, 'digdig', 'logs');
    log = join(dir, 'feedback.jsonl');
});
afterEach(() => { delete process.env.DIGDIG_LOG; });
afterAll(async () => { await rm(paths.home, { recursive: true, force: true }); });

test('is disabled by default and filters all non-allowlisted data', async () => {
    feedbackLog('search', 'start');
    await new Promise(resolve => setTimeout(resolve, 40));
    await expect(stat(dir)).rejects.toThrow();
    process.env.DIGDIG_LOG = '1';
    feedbackLog('provider', 'ok', { provider: 'searxng', count: 3, query: 'private search', url: 'https://secret.example', token: 'secret-token' } as never);
    await waitFor(async () => (await readFile(log, 'utf8').catch(() => '')).includes('provider'));
    const content = await readFile(log, 'utf8');
    expect(content).not.toMatch(/private search|secret\.example|secret-token/);
    expect(JSON.parse(content)).toMatchObject({ event: 'provider', status: 'ok', provider: 'searxng', count: 3 });
});

test('rotates at the limit and logging failure does not throw', async () => {
    await waitFor(async () => !(await stat(join(dir, '.feedback.lock')).catch(() => null)));
    await mkdir(dir, { recursive: true });
    await writeFile(log, Buffer.alloc(10 * 1024 * 1024, 120));
    for (let n = 1; n <= 4; n++) await writeFile(`${log}.${n}`, String(n));
    process.env.DIGDIG_LOG = '1';
    feedbackLog('fusion', 'ok', { count: 1 });
    await waitFor(async () => (await stat(`${log}.1`).catch(() => null)) !== null && (await readFile(log, 'utf8').catch(() => '')).includes('fusion'));
    expect((await stat(`${log}.1`)).size).toBe(10 * 1024 * 1024);
    expect(await readFile(`${log}.4`, 'utf8')).toBe('3');
    await expect(stat(`${log}.5`)).rejects.toThrow();
    await waitFor(async () => !(await stat(join(dir, '.feedback.lock')).catch(() => null)));
    await writeFile(join(dir, '.feedback.lock'), 'occupied');
    expect(() => feedbackLog('search', 'error')).not.toThrow();
    await new Promise(resolve => setTimeout(resolve, 50));
});

test('search and extraction record phases without storing inputs', async () => {
    await rm(join(dir, '.feedback.lock'), { force: true });
    await writeFile(log, '');
    process.env.DIGDIG_LOG = '1';
    const { config } = await import('../src/config.js');
    const { runCli } = await import('../src/runCli.js');
    const { runExtract } = await import('../src/commands/extract.js');
    const oldBase = config.baseUrl;
    config.baseUrl = 'https://endpoint-secret.example';
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        const result = { query: 'private query', numberOfResults: 1, results: [{ url: 'https://secret.example/a', title: 'secret title', content: 'secret body', engine: 'test', category: 'general' }], suggestions: [], answers: [], corrections: [], infoboxes: [], unresponsiveEngines: [] };
        await runCli(['private query', '--format', 'json'], { search: vi.fn().mockResolvedValue(result) } as never);
        await runExtract({ extractBatch: vi.fn().mockResolvedValue([{ url: 'https://secret.example/a', content: 'secret body', method: 'defuddle' }]) } as never, { urls: ['https://secret.example/a'] });
        await waitFor(async () => (await readFile(log, 'utf8')).includes('"event":"extract","status":"ok"'));
        const lines = (await readFile(log, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        expect(lines.map(line => line.event)).toEqual(expect.arrayContaining(['search', 'validation', 'provider', 'fusion', 'extract', 'extract_batch', 'extract_method']));
        expect(new Set(lines.map(line => line.runId)).size).toBe(1);
        expect(JSON.stringify(lines)).not.toMatch(/private query|secret\.example|secret title|secret body/);
    } finally {
        config.baseUrl = oldBase;
        output.mockRestore();
    }
});

test('records provider failures without exposing exception messages', async () => {
    await waitFor(async () => !(await stat(join(dir, '.feedback.lock')).catch(() => null)));
    await writeFile(log, '');
    process.env.DIGDIG_LOG = '1';
    const { config } = await import('../src/config.js');
    const { runCli } = await import('../src/runCli.js');
    const oldBase = config.baseUrl;
    config.baseUrl = 'https://endpoint.example';
    const output = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
        await runCli(['private query'], { search: vi.fn().mockRejectedValue(new Error('secret credential and URL')) } as never);
        await waitFor(async () => (await readFile(log, 'utf8')).includes('"event":"search","status":"error"'));
        const content = await readFile(log, 'utf8');
        expect(content).toContain('"event":"provider","status":"error"');
        expect(content).not.toMatch(/private query|secret credential|URL/);
    } finally {
        config.baseUrl = oldBase;
        process.exitCode = 0;
        output.mockRestore();
    }
});
