/**
 * doc-search subcommand — Search local documents and inject results into session.
 *
 * Searches an Orama BM25 index (auto-indexing if needed), formats results
 * as SessionResult[] with origin tool 'local-index', and adds them to the
 * current round or initializes the first round on a hit.
 */

import { docSearch, parseBoost } from '../deep/local-doc/searcher.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';

export interface DocSearchCliOptions {
  session: string;
  query: string;
  path: string;
  topK: number;
  boost: string; // raw string from CLI, e.g. "title:3,headings:2,content:1"
}

/** Codes the local-doc layer attaches to plain `Error` objects. */
const DOC_SEARCH_CODES = [
  'INDEX_BUSY',
  'INDEX_LOAD_ERROR',
  'MEMORY_LIMIT_REACHED',
  'NO_INDEXABLE_FILES',
  'PATH_NOT_FOUND',
  'EMPTY_QUERY',
  'SEARCH_ERROR',
] as const;
type DocSearchCode = typeof DOC_SEARCH_CODES[number];

export async function runDocSearch(options: DocSearchCliOptions): Promise<number> {
  try {
    const boost = parseBoost(options.boost);
    const result = await docSearch({
      session: options.session,
      query: options.query,
      path: options.path,
      topK: options.topK,
      boost,
    });

    const envelope = createSuccessEnvelope({
      session: result.session,
      query: result.query,
      path: result.path,
      added: result.added,
      totalPending: result.totalPending,
      partial: result.partial,
      results: result.results,
    });
    console.log(JSON.stringify(envelope, null, 2));
    return 0;
  } catch (err) {
    const error = err as Error & { code?: string };
    // The local-doc layer throws `{ code }` on plain `Error` objects, so the
    // code has to be narrowed by hand. Anything unrecognised is a search
    // failure rather than a new vocabulary word.
    const code = DOC_SEARCH_CODES.includes(error.code as DocSearchCode) ? error.code as DocSearchCode : 'SEARCH_FAILED';
    const message = error.message || String(err);
    const envelope = createErrorEnvelope(
      code,
      message,
      { hint: 'Check the document path and session name' }
    );
    console.log(JSON.stringify(envelope, null, 2));
    return 1;
  }
}
