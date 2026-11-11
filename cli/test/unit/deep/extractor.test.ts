import { describe, expect, it, vi } from 'vitest';
import { ContentExtractor, obscuraDownloadUrl } from '../../../src/deep/extractor.js';

const execFileAsync = vi.hoisted(() => vi.fn());
vi.mock('child_process', async (importOriginal) => {
    const original = await importOriginal<typeof import('child_process')>();
    const execFile = Object.assign(vi.fn(), { [Symbol.for('nodejs.util.promisify.custom')]: execFileAsync });
    return { ...original, execFile };
});

describe('obscuraDownloadUrl', () => {
    it.each([
        'obscura-x86_64-linux.tar.gz',
        'obscura-aarch64-linux.tar.gz',
        'obscura-x86_64-macos.tar.gz',
        'obscura-aarch64-macos.tar.gz',
    ])('keeps the %s release asset on the GitHub HTTPS endpoint', (tarball) => {
        const url = new URL(obscuraDownloadUrl(tarball));

        expect(url.protocol).toBe('https:');
        expect(url.hostname).toBe('github.com');
        expect(url.pathname).toBe(`/h4ckf0r0day/obscura/releases/latest/download/${tarball}`);
    });
});

describe('ContentExtractor', () => {
    it.each([1, 49, 50, 99, 100])('retains a real extracted body of %i characters', async (size) => {
        const content = '文'.repeat(size);
        execFileAsync.mockReset().mockRejectedValue(new Error('unavailable'));
        vi.stubGlobal('fetch', vi.fn(async () => new Response(`<html><body><article><p>${content}</p></article></body></html>`)));
        try {
            const result = await new ContentExtractor({ obscura: true, obscuraPath: 'missing-obscura-test-binary' }).extract('https://example.com/article');
            expect(result.content).toBe(content);
            expect(result.error).toBeUndefined();
            expect(result.method).toBe('defuddle');
            expect(result.length).toBe(content.length);
        } finally { vi.unstubAllGlobals(); }
    });

    it('uses and identifies an actually invoked better Obscura fallback', async () => {
        execFileAsync.mockReset().mockImplementation(async (_bin, args) => args[0] === '--version'
            ? { stdout: '1', stderr: '' }
            : { stdout: 'Fallback body with more content 😀', stderr: '' });
        vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body><p>Short</p></body></html>')));
        try {
            const result = await new ContentExtractor({ obscura: true, obscuraPath: 'test-obscura', obscuraDumpFormat: 'markdown' }).extract('https://example.com/article');
            expect(execFileAsync).toHaveBeenCalledTimes(2);
            expect(result).toMatchObject({ method: 'obscura', content: 'Fallback body with more content 😀', length: 'Fallback body with more content 😀'.length });
        } finally { vi.unstubAllGlobals(); }
    });

    it('reports UTF-16 content length rather than word count', async () => {
        const result = await new ContentExtractor().extractFromHtml('<html><body><article><p>Hello world 😀</p></article></body></html>', 'https://example.com');
        expect(result.content).toContain('😀');
        expect(result.length).toBe(result.content.length);
    });

    it('keeps network and blank-page failures as failures', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(new Response('<html><body></body></html>')));
        try {
            expect((await new ContentExtractor().extract('https://example.com/network')).error).toContain('network down');
            expect((await new ContentExtractor().extract('https://example.com/blank')).error).toBeTruthy();
        } finally { vi.unstubAllGlobals(); }
    });

    it('uses Jina directly when an Agent explicitly requests it', async () => {
        const url = 'https://example.com/article';
        const jinaContent = 'J'.repeat(120);

        const fetchMock = vi.fn(async () => ({
            ok: true,
            text: async () => jinaContent,
        }));
        vi.stubGlobal('fetch', fetchMock);

        try {
            const result = await new ContentExtractor({ jina: true }).extract(url);

            expect(result.method).toBe('jina');
            expect(result.content).toBe(jinaContent);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(fetchMock).toHaveBeenCalledWith(
                `https://r.jina.ai/${url}`,
                expect.any(Object),
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
