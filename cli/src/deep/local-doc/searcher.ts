/**
 * Searcher — BM25 search + SessionResult formatting.
 *
 * Searches an Orama index, formats results as SessionResult[]
 * with source: 'local', and injects them into the session pipeline
 * without incrementing the round counter.
 */

import { resolve } from 'path';
import { search as oramaSearch } from '@orama/orama';
import { distance as levenshtein } from 'fastest-levenshtein';
import { scanFiles } from './scanner.js';
import {
  buildIndexFromScannedFiles,
  getIndexMemoryBudget,
  getIndexMeta,
  hasIndex,
  loadIndex,
  refreshIndexIfStale,
} from './indexer.js';
import { DEFAULT_BOOST } from './types.js';
import {
  appendSessionResults,
  getPendingResults,
  injectApprovedResults,
  initSessionDir,
  resolveSessionPath,
  SessionResultInput,
} from '../session.js';

export interface DocSearchOptions {
  session: string;
  query: string;
  path: string;
  topK: number;
  boost?: Record<string, number>;
}

export interface DocSearchResult {
  session: string;
  query: string;
  path: string;
  added: number;
  totalPending: number;
  partial: boolean;
  freshness: 'fresh' | 'stale' | 'partial';
  refreshed: boolean;
  results: SessionResultInput[];
}

/**
 * Parse boost string like "title:3,headings:2,content:1"
 * into an object { title: 3, headings: 2, content: 1 }
 */
function parseBoost(raw: string): Record<string, number> {
  const boost: Record<string, number> = {};
  for (const pair of raw.split(',')) {
    const [k, v] = pair.split(':');
    if (k && v !== undefined) {
      boost[k.trim()] = parseFloat(v.trim());
    }
  }
  return boost;
}

/**
 * Search local documents and inject results into session.
 * Auto-indexes the path if not already indexed.
 */
export async function docSearch(opts: DocSearchOptions): Promise<DocSearchResult> {
  const { query, topK } = opts;
  const absPath = resolve(opts.path);

  // Validate query
  if (!query || query.trim().length === 0) {
    throw Object.assign(new Error('Query is empty'), { code: 'EMPTY_QUERY' });
  }

  // Auto-index if needed
  if (!hasIndex(absPath)) {
    const memoryBudgetBytes = getIndexMemoryBudget();
    try {
      await buildIndexFromScannedFiles(
        absPath,
        scanFiles(absPath, { maxFileSize: Math.min(10 * 1024 * 1024, Math.floor(memoryBudgetBytes / 8)) }),
        memoryBudgetBytes
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'NO_INDEXABLE_FILES') {
        throw Object.assign(
          new Error(`No indexable files found in ${absPath} (supported: .md, .txt)`),
          { code: 'NO_INDEXABLE_FILES' }
        );
      }
      if ((err as { code?: string }).code === 'MEMORY_LIMIT_REACHED') {
        throw Object.assign(new Error('Not enough free memory to index any local documents.'), {
          code: 'MEMORY_LIMIT_REACHED',
        });
      }
      throw err;
    }
    if (!hasIndex(absPath)) {
      throw Object.assign(
        new Error(`No indexable files found in ${absPath} (supported: .md, .txt)`),
        { code: 'NO_INDEXABLE_FILES' }
      );
    }
  }

  let refreshed = false;
  let stale = false;
  try {
    refreshed = await refreshIndexIfStale(absPath);
  } catch {
    // A prior usable index is safer than turning a refresh issue into no search.
    stale = true;
  }

  // Load index
  let db: any;
  try {
    db = await loadIndex(absPath);
  } catch {
    throw Object.assign(
      new Error('Failed to load search index. Try re-indexing with doc-index.'),
      { code: 'INDEX_LOAD_ERROR' }
    );
  }

  // Determine boost
  const boost = opts.boost || DEFAULT_BOOST;

  // Search
  let searchResult: { hits: Array<{ id: string; score: number; document: any }> };
  try {
    searchResult = await oramaSearch(db, {
      term: query,
      mode: 'fulltext',
      limit: topK,
      boost,
    });
  } catch {
    throw Object.assign(
      new Error('Search failed'),
      { code: 'SEARCH_ERROR' }
    );
  }

  // BM25 zero-results fallback: fuzzy title match via Levenshtein
  if (!searchResult.hits || searchResult.hits.length === 0) {
    const fallback = fuzzyTitleFallback(db, query, topK);
    if (fallback.length > 0) {
      searchResult = { hits: fallback };
    }
  }

  if (!searchResult.hits || searchResult.hits.length === 0) {
    return {
      session: opts.session,
      query,
      path: absPath,
      added: 0,
      totalPending: 0,
      partial: getIndexMeta(absPath)?.partial ?? false,
      freshness: stale ? 'stale' : getIndexMeta(absPath)?.partial ? 'partial' : 'fresh',
      refreshed,
      results: [],
    };
  }

  // Format as SessionResult[]
  const results: SessionResultInput[] = [];
  const indexedAt = Date.now();
  for (const hit of searchResult.hits) {
    const doc = hit.document;

    // Build title: "DocumentName — Section / Subsection"
    const sectionParts: string[] = [];
    if (doc.headings && doc.headings.length > 0) {
      sectionParts.push(...doc.headings);
    }
    let title: string;
    if (sectionParts.length > 0) {
      title = `${doc.title || doc.filePath} — ${sectionParts.join(' / ')}`;
    } else {
      title = doc.title || doc.filePath || 'Untitled';
    }

    // Build file:/// URL with absolute path
    const absFile = resolve(absPath, doc.filePath);
    const url = `file://${absFile}#chunk-${doc.chunkIndex}`;

    results.push({
      url,
      title,
      contentType: 'extracted',
      content: doc.content || '',
      extractor: 'local-index',
      extractedAt: indexedAt,
      score: hit.score,
      filePath: doc.filePath,
      headings: doc.headings || [],
      chunkIndex: doc.chunkIndex,
      origins: [{ tool: 'local-index', query }],
    });
  }

  // Local documents are extracted results, so they join the round already in
  // progress instead of opening one — `needsRound` handles that on its own.
  const sessionDir = resolveSessionPath(opts.session);
  initSessionDir(sessionDir); // ensure meta.json exists
  const { added, total, approvedResults } = appendSessionResults(sessionDir, results);
  injectApprovedResults(sessionDir, approvedResults);

  const pendingCount = getPendingResults(sessionDir).length;

  return {
    session: sessionDir,
    query,
    path: absPath,
    added,
    totalPending: pendingCount,
    partial: getIndexMeta(absPath)?.partial ?? false,
    freshness: stale ? 'stale' : getIndexMeta(absPath)?.partial ? 'partial' : 'fresh',
    refreshed,
    results,
  };
}

/**
 * Fallback when BM25 returns zero: match query words against document titles
 * using Levenshtein distance ≤ 2. Returns at most topK results.
 */
function fuzzyTitleFallback(
  db: any,
  query: string,
  topK: number,
): Array<{ id: string; score: number; document: any }> {
  const qWords = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (qWords.length === 0) return [];

  // ponytail: Orama internal doc store, cache-based fallback if access pattern changes
  const docs = db.data?.documents;
  if (!docs || typeof docs.values !== 'function') return [];

  const candidates: Array<{ doc: any; avgDist: number }> = [];

  for (const doc of docs.values()) {
    const title = (doc.title || '').toLowerCase();
    const tWords = title.split(/\s+/).filter(Boolean);
    if (tWords.length === 0) continue;

    let matched = 0;
    let totalDist = 0;
    for (const qw of qWords) {
      let best = Infinity;
      for (const tw of tWords) {
        const d = levenshtein(qw, tw);
        if (d < best) best = d;
      }
      if (best <= 2) { matched++; totalDist += best; }
    }
    // At least half the query words must find a fuzzy match
    if (matched >= Math.ceil(qWords.length / 2)) {
      candidates.push({ doc, avgDist: totalDist / matched });
    }
  }

  candidates.sort((a, b) => a.avgDist - b.avgDist);

  return candidates.slice(0, topK).map((c, i) => ({
    id: c.doc.id || String(i),
    score: 1 / (1 + c.avgDist),
    document: c.doc,
  }));
}

export { parseBoost };
