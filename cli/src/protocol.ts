/**
 * SearXNG CLI - Protocol Definitions
 * Standardized envelope format for CLI communication
 */

import type { SearchErrorCode } from './errors.js';

/**
 * Every error code an envelope can carry that is not already a search failure.
 *
 * The array is the source of truth, not the type, for the same reason
 * `SEARCH_ERROR_CODES` is: the feedback log allowlists codes at runtime, and a
 * type alone is invisible there. `createErrorEnvelope` used to take `string`,
 * so a typo such as `'INVALID_LIMT'` compiled, tested green, and reached the
 * caller as a code nobody could match. Adding a code now means adding it here —
 * a call site that invents one does not compile.
 *
 * The eleven `RESULT_*` / `JSON_*` / `STDIN_EMPTY` / `PATH_INVALID` entries are
 * not written at call sites: they arrive through `ApprovalError.code`,
 * `JsonInputResult.code` and `traversePath`'s return, whose own unions are
 * narrower. They live here because that is the type the envelope carries.
 */
export const CLI_ERROR_CODES = [
    'CATEGORIES_FETCH_EMPTY',
    'CATEGORIES_FETCH_FAILED',
    'CLAIMS_STATE_CORRUPTED',
    'CLAIM_NOT_FOUND',
    'EMPTY_QUERY',
    'EMPTY_SESSION',
    'ENGINES_FETCH_EMPTY',
    'ENGINES_FETCH_FAILED',
    'ENTITY_NOT_FOUND',
    'EXTRACT_FAILED',
    'FILE_READ_FAILED',
    'GRAPH_LOAD_FAILED',
    'GRAPH_NODE_ID_CONFLICT',
    'GRAPH_WRITE_FAILED',
    'HASH_MISMATCH',
    'HEALTH_CHECK_FAILED',
    'INDEX_BUSY',
    'INDEX_FAILED',
    'INDEX_LOAD_ERROR',
    'INVALID_APPROVAL_SELECTION',
    'INVALID_ARGUMENT',
    'INVALID_CLAIMS',
    'INVALID_CONFIDENCE',
    'INVALID_ENGINES',
    'INVALID_EVIDENCE',
    'INVALID_EXTRACTED_RESULT',
    'INVALID_GRAPH_DATA',
    'INVALID_GRAPH_FORMAT',
    'INVALID_JSON',
    'INVALID_LIMIT',
    'INVALID_RESULTS',
    'INVALID_RESULT_PROVENANCE',
    'INVALID_RISK_LEVEL',
    'INVALID_SOURCE_RELATION',
    'INVALID_STANCE',
    'JINA_RATE_LIMITED',
    'JSON_FILE_OUTSIDE_SESSION',
    'JSON_FILE_READ_FAILED',
    'MEMORY_LIMIT_REACHED',
    'MERGE_FILE_FAILED',
    'MISSING_FIELDS',
    'MISSING_GRAPH_FILE',
    'MISSING_JSON_INPUT',
    'MISSING_ORIGIN',
    'MISSING_QUERY',
    'MISSING_SEEDS',
    'MISSING_TEXT',
    'MULTIPLE_JSON_INPUTS',
    'MULTIPLE_SKIP_ACTIONS',
    'NO_ENTITY_SEEDS',
    'NO_INDEXABLE_FILES',
    'NO_PATHS',
    'NO_SEED_FOUND',
    'NO_URLS',
    'OFFSET_OUT_OF_RANGE',
    'PATH_INVALID',
    'PATH_NOT_FOUND',
    'PROVIDER_NOT_CONFIGURED',
    'QUALITY_NO_SESSION',
    'QUOTE_MISMATCH',
    'RESULT_NOT_APPROVED',
    'RESULT_NOT_FOUND',
    'RESULT_NOT_VERIFIED',
    'RESULT_REVISION_CONFLICT',
    'RESULT_SKIPPED',
    'SEARCH_ERROR',
    'SEARCH_FAILED',
    'SESSION_BUSY',
    'SESSION_CORRUPTED',
    'SESSION_MIGRATION_FAILED',
    'SESSION_STORAGE_ERROR',
    'SOURCE_RELATION_CONFLICT',
    'SOURCE_RELATION_NOT_FOUND',
    'SPECIAL_EXTRACTOR_REQUIRES_URLS',
    'STDIN_EMPTY',
    'UNKNOWN_SESSION_URL',
    'UNSUPPORTED_JSON_ENCODING',
] as const;

export type CliErrorCode = typeof CLI_ERROR_CODES[number];

export type CliEnvelopeError = {
    code: SearchErrorCode | CliErrorCode;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
};

export type CliEnvelope<T> = {
    status: 'ok' | 'error';
    data: T | null;
    error: CliEnvelopeError | null;
    hint: string | null;
};

export function createSuccessEnvelope<T>(data: T): CliEnvelope<T> {
    return {
        status: 'ok',
        data,
        error: null,
        hint: null
    };
}

export function createErrorEnvelope(
    code: CliEnvelopeError['code'],
    message: string,
    options: {
        retryable?: boolean;
        details?: Record<string, unknown>;
        hint?: string | null;
    } = {}
): CliEnvelope<null> {
    return {
        status: 'error',
        data: null,
        error: {
            code,
            message,
            retryable: options.retryable ?? false,
            details: options.details
        },
        hint: options.hint ?? null
    };
}
