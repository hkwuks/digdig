/** Import Agent-provided discovery records or extracted bodies into one session. */

import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { appendSessionResults, getPendingExtractionResults, getPendingResults, initSessionDir, resolveSessionPath, ResultOrigin, SessionResultInput } from '../deep/session.js';
import { isJsonObject, readSessionJsonInput } from './json-input.js';

export interface ResultsAddOptions {
    session: string;
    kind: 'search' | 'extracted';
    dataFile?: string;
    query?: string;
    tool?: string;
}

function originFor(item: Record<string, unknown>, options: ResultsAddOptions): ResultOrigin | undefined {
    const tool = typeof item.tool === 'string' ? item.tool : options.tool;
    const query = typeof item.query === 'string' ? item.query : options.query;
    if (!tool || !query) return undefined;
    const engine = typeof item.engine === 'string' ? item.engine : undefined;
    return { tool, engine, query };
}

export async function runResultsAdd(options: ResultsAddOptions): Promise<number> {
    const sessionDir = resolveSessionPath(options.session);
    initSessionDir(sessionDir);
    const input = readSessionJsonInput(sessionDir, [{ option: '--data-file', value: options.dataFile, file: true }]);
    if (!input.ok) {
        console.log(JSON.stringify(createErrorEnvelope(input.code, input.message), null, 2));
        return 1;
    }

    const raw = Array.isArray(input.value) ? input.value : (isJsonObject(input.value) && Array.isArray(input.value.results) ? input.value.results : []);
    if (!raw.length || !raw.every(isJsonObject)) {
        console.log(JSON.stringify(createErrorEnvelope('INVALID_RESULTS', 'The input file must contain a non-empty array of result objects'), null, 2));
        return 1;
    }

    const results: SessionResultInput[] = [];
    for (const item of raw) {
        if (typeof item.url !== 'string' || typeof item.title !== 'string') {
            console.log(JSON.stringify(createErrorEnvelope('INVALID_RESULTS', 'Every result requires string url and title fields'), null, 2));
            return 1;
        }
        const origin = originFor(item, options);
        if (!origin) {
            console.log(JSON.stringify(createErrorEnvelope('MISSING_ORIGIN', 'Every imported result requires tool and query (in the item or command options)'), null, 2));
            return 1;
        }
        if (options.kind === 'search') {
            results.push({
                url: item.url,
                title: item.title,
                contentType: 'search',
                excerpt: typeof item.excerpt === 'string' ? item.excerpt : undefined,
                origins: [origin],
                score: typeof item.score === 'number' ? item.score : undefined,
                fusionScore: typeof item.fusionScore === 'number' ? item.fusionScore : undefined,
                retrievedAt: typeof item.retrievedAt === 'number' ? item.retrievedAt : undefined,
                rank: typeof item.rank === 'number' ? item.rank : undefined,
                publishedDate: typeof item.publishedDate === 'string' ? item.publishedDate : undefined,
            });
            continue;
        }
        if (typeof item.content !== 'string' || !item.content.trim() || typeof item.extractor !== 'string' || !item.extractor) {
            console.log(JSON.stringify(createErrorEnvelope('INVALID_EXTRACTED_RESULT', 'Extracted imports require non-empty content and extractor'), null, 2));
            return 1;
        }
        results.push({
            url: item.url,
            title: item.title,
            contentType: 'extracted',
            content: item.content,
            extractor: item.extractor,
            extractedAt: typeof item.extractedAt === 'number' ? item.extractedAt : Date.now(),
            excerpt: typeof item.excerpt === 'string' ? item.excerpt : undefined,
            origins: [origin],
            byline: typeof item.byline === 'string' ? item.byline : undefined,
            siteName: typeof item.siteName === 'string' ? item.siteName : undefined,
        });
    }

    const result = appendSessionResults(sessionDir, results);
    console.log(JSON.stringify(createSuccessEnvelope({
        added: result.added,
        updated: result.updated,
        total: result.total,
        round: result.round,
        pendingExtraction: getPendingExtractionResults(sessionDir).length,
        pendingApproval: getPendingResults(sessionDir).length,
    }), null, 2));
    return 0;
}
