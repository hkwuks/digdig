/** Extract bodies. Session convenience mode never revisits extracted/skipped records. */

import { ContentExtractor, ExtractedContent } from '../deep/extractor.js';
import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { getPendingExtractionResults, loadSessionResults, recordExtractionOutcome, resolveSessionPath } from '../deep/session.js';
import { dedupe, resultUrlKey } from '../deep/dedupe.js';

export interface ExtractOptions {
    urls?: string[];
    session?: string;
    jina?: boolean;
    obscura?: boolean;
}

function failureFrom(content: ExtractedContent): { code: 'network' | 'parse' | 'empty' | 'tool'; message: string; retryAfterMs?: number; retryAt?: number } | undefined {
    if (content.error) return { code: 'tool', message: content.error, retryAfterMs: content.retryAfterMs, retryAt: content.retryAt };
    if (!content.content?.trim()) return { code: 'empty', message: 'Extractor returned blank content' };
    return undefined;
}

export async function runExtract(extractor: ContentExtractor, options: ExtractOptions): Promise<number> {
    if ((options.jina || options.obscura) && !options.urls?.length) {
        console.log(JSON.stringify(createErrorEnvelope(
            'SPECIAL_EXTRACTOR_REQUIRES_URLS',
            'Jina and Obscura require explicit session URLs so the Agent controls special extraction',
        ), null, 2));
        return 1;
    }

    const sessionDir = options.session ? resolveSessionPath(options.session) : undefined;
    let urls = options.urls ?? [];
    if (sessionDir && options.urls?.length) {
        const known = new Set(loadSessionResults(sessionDir).map(result => resultUrlKey(result)));
        const unknown = options.urls.find(url => !known.has(resultUrlKey({ url })));
        if (unknown) {
            console.log(JSON.stringify(createErrorEnvelope('UNKNOWN_SESSION_URL', `URL is not a result in this session: ${unknown}`), null, 2));
            return 1;
        }
    } else if (sessionDir) {
        urls = getPendingExtractionResults(sessionDir).map(result => result.url).filter(url => !url.startsWith('file:'));
    }

    if (!urls.length) {
        if (sessionDir && options.urls === undefined) {
            console.log(JSON.stringify(createErrorEnvelope('NO_URLS', 'No unextracted session URLs are eligible for extraction'), null, 2));
            return 1;
        }
        console.log(JSON.stringify(createSuccessEnvelope({ extracted: [], failed: [], skipped: [], stats: { total: 0, success: 0, failed: 0 } }), null, 2));
        return 0;
    }

    try {
        const responses = await extractor.extractBatch(urls);
        const valid = responses.filter(response => !failureFrom(response));
        const extracted = dedupe(valid);
        const retained = new Set(extracted.map(response => resultUrlKey(response)));
        const outcomes = responses.map(response => {
            const failure = failureFrom(response) ?? (retained.has(resultUrlKey(response)) ? undefined : { code: 'tool' as const, message: 'Duplicate extracted body' });
            return failure ? { url: response.url, failure } : { ...response, extractor: options.jina ? 'jina' : options.obscura ? 'obscura' : 'default' };
        });
        const session = sessionDir ? recordExtractionOutcome(sessionDir, outcomes) : undefined;
        const failures = outcomes.filter((outcome): outcome is { url: string; failure: NonNullable<ReturnType<typeof failureFrom>> } => 'failure' in outcome);
        const failed = failures.map(outcome => outcome.url);
        const rateLimited = failures.find(outcome => outcome.failure.retryAfterMs !== undefined);
        if (rateLimited) {
            console.log(JSON.stringify(createErrorEnvelope(
                'JINA_RATE_LIMITED',
                rateLimited.failure.message,
                {
                    retryable: true,
                    details: {
                        failed,
                        session,
                        retryAfterMs: rateLimited.failure.retryAfterMs,
                        retryAt: rateLimited.failure.retryAt,
                    },
                },
            ), null, 2));
            return 1;
        }
        console.log(JSON.stringify(createSuccessEnvelope({
            extracted,
            failed,
            skipped: [],
            stats: { total: urls.length, success: extracted.length, failed: failed.length },
            ...(session ? { session } : {}),
        }), null, 2));
        return 0;
    } catch (error) {
        console.log(JSON.stringify(createErrorEnvelope('EXTRACT_FAILED', error instanceof Error ? error.message : 'Content extraction failed', { retryable: true }), null, 2));
        return 1;
    }
}
