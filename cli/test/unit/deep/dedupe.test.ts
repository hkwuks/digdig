import { describe, it, expect } from 'vitest';
import { resultUrlKey, dedupeByUrl, dedupeByJaccard, dedupe } from '../../src/deep/dedupe.js';
import type { DedupItem } from '../../src/deep/dedupe.js';

describe('dedupe', () => {
    describe('resultUrlKey', () => {
        it('removes trailing slash', () => {
            expect(resultUrlKey({ url: 'https://example.com/' })).toBe('https://example.com/');
            expect(resultUrlKey({ url: 'https://example.com/path/' })).toBe('https://example.com/path');
        });

        it('strips hash fragments from web URLs', () => {
            expect(resultUrlKey({ url: 'https://example.com/page#section' })).not.toContain('#');
        });

        it('keeps the fragment on local document chunks', () => {
            expect(resultUrlKey({ url: 'file:///docs/a.md#chunk-0' })).toBe('file:///docs/a.md#chunk-0');
            expect(resultUrlKey({ url: 'file:///docs/a.md#chunk-7' })).not.toBe(resultUrlKey({ url: 'file:///docs/a.md#chunk-0' }));
        });

        it('keeps the fragment when the result is tagged local even without a file: URL', () => {
            const a = { url: 'https://example.com/doc#chunk-0', source: 'local' };
            const b = { url: 'https://example.com/doc#chunk-1', source: 'local' };
            expect(resultUrlKey(a)).not.toBe(resultUrlKey(b));
        });

        it('collapses different fragments of the same web page', () => {
            expect(resultUrlKey({ url: 'https://x.com/a#s' })).toBe(resultUrlKey({ url: 'https://x.com/a#t' }));
        });

        it('sorts query parameters', () => {
            const norm = resultUrlKey({ url: 'https://example.com?b=2&a=1' });
            expect(norm).toContain('a=1');
            expect(norm.indexOf('a=1')).toBeLessThan(norm.indexOf('b=2'));
        });

        it('returns original string for invalid URLs', () => {
            expect(resultUrlKey({ url: 'not-a-url' })).toBe('not-a-url');
        });

        it('is idempotent', () => {
            const urls = ['https://example.com/a/', 'https://x.com/p?b=2&a=1', 'file:///docs/a.md#chunk-3', 'not-a-url'];
            for (const url of urls) {
                const once = resultUrlKey({ url });
                expect(resultUrlKey({ url: once })).toBe(once);
            }
        });
    });

    describe('dedupeByUrl', () => {
        it('removes duplicates by normalized URL', () => {
            const items: DedupItem[] = [
                { url: 'https://example.com/a', title: 'A', content: 'content a' },
                { url: 'https://example.com/a/', title: 'A2', content: 'content a2' },
                { url: 'https://example.com/b', title: 'B', content: 'content b' },
            ];
            const result = dedupeByUrl(items);
            expect(result).toHaveLength(2);
        });

        it('keeps first occurrence', () => {
            const items: DedupItem[] = [
                { url: 'https://example.com/a', title: 'First', content: 'first' },
                { url: 'https://example.com/a/', title: 'Second', content: 'second' },
            ];
            const result = dedupeByUrl(items);
            expect(result[0].title).toBe('First');
        });

        it('keeps distinct local document chunks apart', () => {
            const items: DedupItem[] = [
                { url: 'file:///docs/a.md#chunk-0', title: 'a', content: 'first chunk' },
                { url: 'file:///docs/a.md#chunk-7', title: 'a', content: 'another chunk' },
            ];
            expect(dedupeByUrl(items)).toHaveLength(2);
        });
    });

    describe('dedupeByJaccard', () => {
        it('removes long near-duplicate content', () => {
            const content = `${Array.from(
                { length: 100 },
                (_, index) => `Section ${index.toString().padStart(3, '0')} documents event ${index * 17} and its verified source.`,
            ).join(' ')} This revision contains the original conclusion.`;
            const items: DedupItem[] = [
                { url: 'https://a.com', title: 'Rust async runtime', content },
                { url: 'https://b.com', title: 'Rust async runtime', content: content.replace('original', 'reviewed') },
            ];
            expect(dedupeByJaccard(items)).toHaveLength(1);
        });

        it('keeps non-identical short content', () => {
            const items: DedupItem[] = [
                { url: 'https://a.com', title: 'A', content: 'abcdefghijklmnopqrst' },
                { url: 'https://b.com', title: 'B', content: 'abcdefghijklmnopqrstu' },
            ];
            expect(dedupeByJaccard(items)).toHaveLength(2);
        });

        it('compares the complete content rather than a prefix', () => {
            const prefix = 'This shared introduction appears on both pages before their independent analysis. '.repeat(20);
            const items: DedupItem[] = [
                { url: 'https://a.com', title: 'A', content: `${prefix}${'The first report examines renewable energy storage. '.repeat(60)}` },
                { url: 'https://b.com', title: 'B', content: `${prefix}${'The second report examines quantum error correction. '.repeat(60)}` },
            ];
            expect(dedupeByJaccard(items)).toHaveLength(2);
        });
    });
    describe('dedupe', () => {
        it('chains URL and Jaccard dedup', () => {
            const items: DedupItem[] = [
                { url: 'https://a.com', title: 'Rust', content: 'Rust programming language tutorial' },
                { url: 'https://b.com', title: 'Python', content: 'Python programming language tutorial' },
                { url: 'https://a.com/', title: 'Rust dup', content: 'Rust programming language tutorial' },
            ];
            const result = dedupe(items);
            // URL dedup removes the third item; content remains distinct.
            expect(result.length).toBeLessThanOrEqual(2);
        });
    });
});
