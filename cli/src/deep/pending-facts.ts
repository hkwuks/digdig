/**
 * The pending-approval list, as countable facts.
 *
 * This module replaced the quality verdict. What a verdict did was answer
 * "is this batch good", and it could not: the numbers behind it were measured
 * against thresholds that 5 of 7 real sessions failed, one indicator compared
 * titles while believing it compared bodies, and nothing ever acted on the
 * answer. What is left is what a reviewer actually reads — how many results
 * there are, how many carry a body, where they came from — plus the per-result
 * fields needed to approve one.
 *
 * The judgement "is that enough" stays with the caller. It depends on what was
 * asked, which this module does not know.
 */

import { sourceKey } from './dedupe.js';
import { firstRound } from './coverage.js';
import { SessionResult, hasVerifiedContent } from './session.js';

export interface PendingFact {
    id: string;
    revision: number;
    title?: string;
    url: string;
    /** The tool that produced the result: `digdig`, `exa`, `tavily`, ... */
    source: string;
    /** Where it came from — hostname, or a local document's path. */
    domain?: string;
    /** Length of the extracted body. Zero means nothing was extracted. */
    contentLength: number;
    /** Whether the record carries a body at all. */
    extracted: boolean;
    /**
     * Whether the record carries everything approval requires. Stricter than
     * `extracted`: a body without extractor metadata is readable but not
     * approvable, and the two are worth telling apart.
     */
    verified: boolean;
    /** First round that saw it; absent on a session predating round tracking. */
    round?: number;
}

export interface PendingReport {
    total: number;
    extracted: number;
    unextracted: number;
    /** Distinct sources across the whole session. */
    sources: number;
    sourceList: string[];
    pending: PendingFact[];
}

/**
 * Describe one result.
 *
 * `contentLength` is the body length, not a display fallback: a search result
 * keeps its snippet in `excerpt` and has no `content` until an extractor runs,
 * so reading `content || excerpt` here would report an unextracted result as
 * though it had been read.
 */
export function describeResult(result: SessionResult): PendingFact {
    const fact: PendingFact = {
        id: result.id,
        revision: result.revision,
        url: result.url,
        source: typeof result.source === 'string' && result.source ? result.source : 'digdig',
        contentLength: result.content?.length ?? 0,
        extracted: typeof result.content === 'string' && result.content.trim().length > 0,
        verified: hasVerifiedContent(result),
    };

    if (result.title) fact.title = result.title;

    const domain = sourceKey(result.url);
    if (domain) fact.domain = domain;

    // Absent rather than zero: a session stored before rounds existed has no
    // round to report, and `0` would read as "round zero".
    const round = firstRound(result);
    if (round !== undefined) fact.round = round;

    return fact;
}

/**
 * Build the report for a session.
 *
 * Counts cover every stored result, because "how much has this session
 * gathered" is the question the counts answer. `pending` covers only the
 * records awaiting a decision, which is what the caller can act on.
 */
export function buildPendingReport(results: SessionResult[], pending: SessionResult[]): PendingReport {
    const sources = new Set<string>();
    let extracted = 0;

    for (const result of results) {
        const source = sourceKey(result.url);
        if (source) sources.add(source);
        if (typeof result.content === 'string' && result.content.trim().length > 0) extracted++;
    }

    return {
        total: results.length,
        extracted,
        unextracted: results.length - extracted,
        sources: sources.size,
        sourceList: [...sources].sort(),
        pending: pending.map(describeResult),
    };
}
