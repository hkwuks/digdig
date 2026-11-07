import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/deep/tfidf.js';

describe('tfidf', () => {
    describe('tokenize', () => {
        it('splits English text by whitespace', () => {
            const tokens = tokenize('tokio async runtime');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('async');
            expect(tokens).toContain('runtime');
        });

        it('removes words shorter than 3 chars', () => {
            const tokens = tokenize('a an is tokio');
            expect(tokens).not.toContain('a');
            expect(tokens).not.toContain('an');
            expect(tokens).not.toContain('is');
            expect(tokens).toContain('tokio');
        });

        it('lowercases tokens', () => {
            const tokens = tokenize('Tokio Runtime');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('runtime');
        });

        it('removes punctuation from tokens', () => {
            const tokens = tokenize('tokio, runtime! async-std.');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('runtime');
            // "async-std" → punctuation stripped → "asyncstd"
            expect(tokens).toContain('asyncstd');
        });

        it('expands CJK text via character bigram', () => {
            const tokens = tokenize('异步运行时');
            // bigrams: 异步, 步运, 运行, 行时
            expect(tokens).toContain('异步');
            expect(tokens).toContain('步运');
            expect(tokens).toContain('运行');
            expect(tokens).toContain('行时');
        });

        it('handles single CJK character', () => {
            const tokens = tokenize('异');
            expect(tokens).toContain('异');
        });

        it('handles mixed English+CJK text', () => {
            const tokens = tokenize('tokio 异步 runtime');
            expect(tokens).toContain('tokio');
            expect(tokens).toContain('runtime');
            // CJK part: 异步 is a bigram from the token "异步"
            expect(tokens).toContain('异步');
        });

        it('keeps the ASCII word when a token mixes ASCII and CJK', () => {
            // 'github中文社区' used to fall through the CJK branch as a whole and
            // come out as ["gi","it","th","hu","ub","b中","中文","文社","社区"] —
            // the word 'github' never appeared at all.
            const tokens = tokenize('github中文社区');
            expect(tokens).toContain('github');
            expect(tokens).toContain('中文');
            expect(tokens).toContain('社区');
            for (const fragment of ['gi', 'it', 'th', 'hu', 'ub']) {
                expect(tokens).not.toContain(fragment);
            }
        });

        it('keeps the leading ASCII word and does not bigram across the boundary', () => {
            // 'rust异步运行时' lost 'rust' entirely and produced none of 步运/行时
            // in a form a reader could use, because every character pair spanning
            // ASCII and CJK was emitted as if it were a CJK bigram.
            const tokens = tokenize('rust异步运行时');
            expect(tokens).toContain('rust');
            expect(tokens).toContain('异步');
            expect(tokens).toContain('运行');
            for (const fragment of ['ru', 'us', 'st']) {
                expect(tokens).not.toContain(fragment);
            }
            expect(tokens).not.toContain('t异');
        });

        it('leaves pure-ASCII tokens alone', () => {
            const tokens = tokenize('Tokio async-std');
            expect(tokens).toContain('tokio');
            // 'async-std' → punctuation stripped → 'asyncstd', unchanged by this fix
            expect(tokens).toContain('asyncstd');
        });

        it('returns empty for empty string', () => {
            expect(tokenize('')).toEqual([]);
        });

        it('returns empty for only short words', () => {
            expect(tokenize('a an is')).toEqual([]);
        });
    });
});
