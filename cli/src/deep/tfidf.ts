/**
 * Lightweight TF-IDF implementation with defined tokenization strategy.
 *
 * Tokenization (whitespace_min3_cjk_bigram):
 *   - English: whitespace split + remove words < 3 chars
 *   - CJK fallback: character bigram (no external deps like jieba)
 *   - Mixed: whitespace split, expand CJK-containing tokens via bigram
 *
 * Only processes title + content (not full text).
 * Only computed on results that have a `content` field.
 */

// ── Tokenization ──────────────────────────────────────────────

const CJK_RANGE = /[一-鿿㐀-䶿　-〿]/;
// A maximal run of CJK characters, or a maximal run of everything else. Splitting
// on runs is what keeps an ASCII word whole when it is glued to CJK: testing the
// token as a whole only asks whether it *contains* CJK, so `github中文社区` used
// to enter the bigram branch as one string and come out as
// ["gi","it","th","hu","ub","b中","中文","文社","社区"] with `github` absent.
const CJK_RUN = /[一-鿿㐀-䶿]+|[^一-鿿㐀-䶿]+/g;

/** Tokenize a single text string */
export function tokenize(text: string): string[] {
    const tokens: string[] = [];
    // Split by whitespace
    const parts = text.split(/\s+/).filter(Boolean);

    for (const part of parts) {
        const cleaned = part.toLowerCase().replace(/[^\w一-鿿㐀-䶿]/g, '');
        if (!cleaned) continue;

        for (const run of cleaned.match(CJK_RUN) ?? []) {
            if (CJK_RANGE.test(run)) {
                // A CJK run is expanded via character bigram. No pair spans the
                // run boundary, so no `t异`-style fragment is ever emitted.
                for (let i = 0; i < run.length - 1; i++) {
                    tokens.push(run.slice(i, i + 2));
                }
                // Also push single CJK chars if the run is a single char
                if (run.length === 1) tokens.push(run);
            } else if (run.length >= 3) {
                // English/ASCII run: kept whole, only drop runs shorter than 3
                tokens.push(run);
            }
        }
    }

    return tokens;
}

/** Description of what `tokenize` does, for callers that report it to the Agent. */
export const TOKENIZATION_STRATEGY = 'whitespace_min3_cjk_bigram_split';

