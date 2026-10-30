/**
 * Deduplication utilities for search results
 */

export interface DedupItem {
    url: string;
    title: string;
    content: string;
}

function normalizeUrl(url: string): string {
    try {
        const u = new URL(url);
        // Remove trailing slash, sort params, strip fragments
        u.pathname = u.pathname.replace(/\/$/, '') || '/';
        u.hash = '';
        u.searchParams.sort();
        return u.toString();
    } catch {
        return url;
    }
}

/** Keep a local document's chunk fragment, while normalizing all other URLs. */
export function resultUrlKey(result: { url: string; source?: string }): string {
    const normalized = normalizeUrl(result.url);
    if (result.source !== 'local' && !result.url.startsWith('file:')) return normalized;

    try {
        return `${normalized}${new URL(result.url).hash}`;
    } catch {
        return result.url;
    }
}

export function dedupeByUrl<T extends DedupItem>(items: T[]): T[] {
    const seen = new Map<string, T>();

    for (const item of items) {
        const norm = resultUrlKey(item);
        if (!seen.has(norm)) {
            seen.set(norm, item);
        }
    }

    return Array.from(seen.values());
}

const NGRAM_SIZE = 5;
const SHORT_TEXT_LENGTH = 300;

function normalizeText(text: string): string {
    return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function characterNgrams(text: string): Set<string> {
    const ngrams = new Set<string>();
    for (let index = 0; index <= text.length - NGRAM_SIZE; index++) {
        ngrams.add(text.slice(index, index + NGRAM_SIZE));
    }
    return ngrams;
}

export function jaccardSimilarity(left: string, right: string): number {
    const normalizedLeft = normalizeText(left);
    const normalizedRight = normalizeText(right);
    if (normalizedLeft === normalizedRight) return 1;
    if (normalizedLeft.length < NGRAM_SIZE || normalizedRight.length < NGRAM_SIZE) return 0;

    const leftNgrams = characterNgrams(normalizedLeft);
    const rightNgrams = characterNgrams(normalizedRight);
    let intersection = 0;
    for (const ngram of leftNgrams) {
        if (rightNgrams.has(ngram)) intersection++;
    }
    return intersection / (leftNgrams.size + rightNgrams.size - intersection);
}

function jaccardThreshold(left: string, right: string, threshold: number): number {
    return Math.min(left.length, right.length) < SHORT_TEXT_LENGTH
        ? Math.max(threshold, 0.97)
        : threshold;
}

export function dedupeByJaccard<T extends DedupItem>(items: T[], threshold: number = 0.92): T[] {
    const kept: T[] = [];
    const contents: string[] = [];

    // ponytail: O(n^2) comparison is acceptable for bounded result batches; add candidate indexing if batches grow.
    for (const item of items) {
        const content = item.content;
        let isDuplicate = false;
        for (const existing of contents) {
            if (jaccardSimilarity(content, existing) >= jaccardThreshold(content, existing, threshold)) {
                isDuplicate = true;
                break;
            }
        }

        if (!isDuplicate) {
            kept.push(item);
            contents.push(content);
        }
    }

    return kept;
}

export function dedupe<T extends DedupItem>(items: T[], threshold: number = 0.92): T[] {
    const urlDeduped = dedupeByUrl(items);
    return dedupeByJaccard(urlDeduped, threshold);
}
