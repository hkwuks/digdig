/**
 * graph-preprocess: Preprocess session data to produce co-occurrence pairs,
 * term frequencies, and existing entity context for Agent consumption.
 */

import { DirectedGraph } from 'graphology';
import { TOKENIZATION_STRATEGY } from './tfidf.js';
import { buildCoOccurrence, computeCrossResultFrequency, getExistingEntityContext } from './co-occurrence.js';
import { hasVerifiedContent, loadSessionResults, loadSessionGraph, loadSessionRounds } from './session.js';
import { GraphNodeAttrs, GraphEdgeAttrs } from './graph.js';

export interface PreprocessResult {
    coOccurrences: Array<{ term1: string; term2: string; count: number }>;
    existingEntities: Array<{ id: string; label: string; degree: number; entityType?: string }>;
    resultProvenance: Array<{ id: string; revision: number; url: string; title: string; approval: 'pending' | 'approved'; rounds: number[] }>;
    termFrequencies: Array<{ term: string; count: number }>;
    roundsCovered: number;
    totalResults: number;
    resultsWithContent: number;
    tokenizationStrategy: string;
    coOccurrenceTruncated: boolean;
}

export interface PreprocessOptions {
    top?: number;
    coOccurrenceThreshold?: number;
    maxTermsForCoOccurrence?: number;
}

/** Run full preprocessing pipeline on a session directory. */
export function graphPreprocess(
    sessionDir: string,
    opts?: PreprocessOptions
): PreprocessResult {
    const results = loadSessionResults(sessionDir);
    const graph: DirectedGraph<GraphNodeAttrs, GraphEdgeAttrs> = loadSessionGraph(sessionDir);
    const bodyResults = results.filter(hasVerifiedContent);

    const coOcc = buildCoOccurrence(bodyResults, {
        threshold: opts?.coOccurrenceThreshold,
        maxTerms: opts?.maxTermsForCoOccurrence,
    });
    const termFreqs = computeCrossResultFrequency(bodyResults, { top: opts?.top ?? 50 });
    const entities = getExistingEntityContext(graph);
    const resultProvenance = bodyResults.map(result => ({
        id: result.id,
        revision: result.revision,
        url: result.url,
        title: result.title,
        approval: result.status,
        // The rounds that discovered this body. A result carries one origin per
        // discovery; extraction reuses the discovering origin's round, so this
        // is the set a reader needs to place the body on the session timeline.
        rounds: [...new Set(result.origins.map(origin => origin.round).filter((round): round is number => typeof round === 'number'))].sort((a, b) => a - b),
    }));

    return {
        coOccurrences: coOcc.pairs,
        existingEntities: entities,
        resultProvenance,
        termFrequencies: termFreqs,
        roundsCovered: loadSessionRounds(sessionDir),
        totalResults: results.length,
        resultsWithContent: bodyResults.length,
        tokenizationStrategy: TOKENIZATION_STRATEGY,
        coOccurrenceTruncated: coOcc.truncated,
    };
}
