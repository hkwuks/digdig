/**
 * What this session has looked at, as countable facts.
 *
 * A search now shows only what it just found, so the shape of the whole session
 * has to come from somewhere. It does not come from the knowledge graph: graph
 * structure is built from *approved* results, so it is empty exactly while the
 * decision is still open, and a session that is three rounds in but has not
 * approved anything has no graph at all.
 *
 * It does not come from a topic model either. The judgement "these results
 * cover four aspects and miss a fifth" is a judgement, and the cheap ways of
 * automating it do not work at this scale: word-bag clustering cannot group two
 * phrasings of one aspect (measured cosine 0.102 same-aspect against 0.012
 * cross-aspect, and no pair cleared a 0.3 threshold), and a real embedding model
 * is too heavy for a CLI. So this module reports only what can be counted, and
 * the caller draws the conclusion.
 */

import type { SessionResult } from './session.js';
import { sourceKey } from './dedupe.js';
import { tokenize } from './tfidf.js';

export interface RoundFacts {
    round: number;
    queries: string[];
    engines: string[];
    /** Results this round is the earliest sighting of. */
    newResults: number;
    /** How many of this round's results an earlier round had already seen. */
    repeatedFromEarlier: number;
    /** Titles this round introduced, capped by the caller's budget. */
    titles: string[];
}

export interface CoverageReport {
    rounds: number;
    uniqueResults: number;
    /** Rounds in order, each with the queries that ran in it. */
    byRound: RoundFacts[];
    /**
     * URLs seen in more than one round, with the rounds that saw them. A query
     * whose every result was already known is the clearest signal a topic is
     * saturated.
     */
    repeated: Array<{ url: string; rounds: number[] }>;
    /**
     * Terms confined to a single round, repeated across results.
     *
     * A term spread over every round is the session's subject (`tokio`, `async`);
     * a term that appears only inside one round's results names what that round
     * actually looked at. This is the distinction plain tf-idf cannot make — it
     * sorts by aggregated frequency, which puts the subject first.
     */
    distinctiveTerms: Array<{ term: string; round: number; docFreq: number }>;
    /** Hosts this session has actually retrieved from, most-used first. */
    domainsSeen: Array<{ domain: string; results: number }>;
    /**
     * Hosts from `SPECIALIZED_SOURCES` that no result came from.
     *
     * Which of these a question still needs is a judgement; that none of them
     * has been touched is a fact, and the two are one lookup apart.
     */
    untouchedSpecialized: string[];
}

const REPEATED_TITLES_PER_ROUND = 15;

/**
 * Source types a deep question usually needs and a general web search rarely
 * returns: papers, code, package registries, Q&A. Kept as a list rather than
 * derived, because "is this a primary source for this question" is not
 * something a hostname can answer.
 */
const SPECIALIZED_SOURCES = [
    'arxiv.org',
    'semanticscholar.org',
    'github.com',
    'stackoverflow.com',
    'docs.rs',
    'npmjs.com',
    'pypi.org',
    'crates.io',
    'medium.com',
    'dev.to',
    'reddit.com',
    'hackernews.com',
];

/**
 * The round a result first appeared in.
 *
 * Exported because the pending-facts report needs the same fact, and a second
 * implementation of "first sighting" would eventually disagree with this one.
 */
export function firstRound(result: SessionResult): number | undefined {
    let earliest: number | undefined;
    for (const origin of result.origins ?? []) {
        const round = origin.round;
        if (!Number.isInteger(round)) continue;
        if (earliest === undefined || round! < earliest) earliest = round;
    }
    return earliest;
}

/** Every round that produced this result, deduplicated and sorted. */
function roundsOf(result: SessionResult): number[] {
    const rounds = new Set<number>();
    for (const origin of result.origins ?? []) {
        if (Number.isInteger(origin.round)) rounds.add(origin.round!);
    }
    return [...rounds].sort((a, b) => a - b);
}

export function buildCoverage(
    results: SessionResult[],
    rounds: number,
    options?: { titlesPerRound?: number; maxTerms?: number }
): CoverageReport {
    const titlesPerRound = options?.titlesPerRound ?? REPEATED_TITLES_PER_ROUND;
    const maxTerms = options?.maxTerms ?? 40;

    const byRound = new Map<number, RoundFacts>();
    const repeated: Array<{ url: string; rounds: number[] }> = [];

    const factsFor = (round: number): RoundFacts => {
        const existing = byRound.get(round);
        if (existing) return existing;
        const created: RoundFacts = {
            round, queries: [], engines: [], newResults: 0,
            repeatedFromEarlier: 0, titles: [],
        };
        byRound.set(round, created);
        return created;
    };

    for (const result of results) {
        const seen = roundsOf(result);
        if (seen.length > 1) repeated.push({ url: result.url, rounds: seen });

        const first = firstRound(result);
        if (first === undefined) continue;

        // A result belongs to the round that first saw it. Counting it again in
        // a later round would make a re-run look productive.
        const home = factsFor(first);
        home.newResults++;
        if (result.title && home.titles.length < titlesPerRound) home.titles.push(result.title);

        // Every round that saw it still recorded a query, and a round whose
        // results were all already known is what saturation looks like.
        for (const round of seen) {
            const facts = factsFor(round);
            if (round > first) facts.repeatedFromEarlier++;
            for (const origin of result.origins ?? []) {
                if (origin.round !== round) continue;
                if (origin.query && !facts.queries.includes(origin.query)) facts.queries.push(origin.query);
                if (origin.engine && !facts.engines.includes(origin.engine)) facts.engines.push(origin.engine);
            }
        }
    }

    return {
        rounds,
        uniqueResults: results.length,
        byRound: [...byRound.values()].sort((a, b) => a.round - b.round),
        repeated: repeated.sort((a, b) => b.rounds.length - a.rounds.length || a.url.localeCompare(b.url)),
        distinctiveTerms: distinctiveTermsOf(results, maxTerms),
        ...domainFactsOf(results),
    };
}

/**
 * Which hosts the session has drawn from, and which specialized ones it has not.
 *
 * A `file:` result is a local document; its source is its path, so it counts
 * like any other source rather than vanishing under an empty hostname.
 */
function domainFactsOf(results: SessionResult[]): Pick<CoverageReport, 'domainsSeen' | 'untouchedSpecialized'> {
    const counts = new Map<string, number>();
    for (const result of results) {
        const source = sourceKey(result.url);
        if (!source) continue;
        counts.set(source, (counts.get(source) ?? 0) + 1);
    }

    const domainsSeen = [...counts.entries()]
        .map(([domain, count]) => ({ domain, results: count }))
        .sort((a, b) => b.results - a.results || a.domain.localeCompare(b.domain));

    const touched = new Set(domainsSeen.map(entry => entry.domain));
    return {
        domainsSeen,
        untouchedSpecialized: SPECIALIZED_SOURCES.filter(source => !touched.has(source)),
    };
}

/** Terms that name one round's subject rather than the session's. */
function distinctiveTermsOf(
    results: SessionResult[],
    maxTerms: number
): Array<{ term: string; round: number; docFreq: number }> {
    // term → the rounds that used it → how many results in that round used it
    const uses = new Map<string, Map<number, number>>();

    for (const result of results) {
        // At zero extraction a search result carries only its snippet, and the
        // snippet is what the round actually returned. Extracted results carry
        // the full body instead, so prefer that.
        const text = result.content || result.excerpt;
        if (!text && !result.title) continue;
        const round = firstRound(result);
        if (round === undefined) continue;

        const seen = new Set(tokenize(`${result.title ?? ''} ${text ?? ''}`));
        for (const term of seen) {
            const byRoundCount = uses.get(term) ?? new Map<number, number>();
            byRoundCount.set(round, (byRoundCount.get(round) ?? 0) + 1);
            uses.set(term, byRoundCount);
        }
    }

    const terms: Array<{ term: string; round: number; docFreq: number }> = [];
    for (const [term, byRoundCount] of uses) {
        // Used in more than one round: it belongs to the shared subject, not to
        // any single round's aspect.
        if (byRoundCount.size !== 1) continue;
        const [round, count] = [...byRoundCount.entries()][0];
        // Seen once is a stray token, not a pattern.
        if (count < 2) continue;
        terms.push({ term, round, docFreq: count });
    }

    // Strongest within-round repetition first, then alphabetical so the output
    // is stable across runs.
    return terms
        .sort((a, b) => b.docFreq - a.docFreq || a.round - b.round || a.term.localeCompare(b.term))
        .slice(0, maxTerms);
}
