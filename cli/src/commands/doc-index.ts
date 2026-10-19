/**
 * doc-index subcommand — Index local documents for BM25 search.
 *
 * Scans a directory for text files, chunks them, and builds an
 * Orama BM25 index persisted to .digdig/docs/<path-hash>/.
 */

import { resolve } from 'path';
import { scanFiles } from '../deep/local-doc/scanner.js';
import { buildIndexFromScannedFiles, getIndexMemoryBudget } from '../deep/local-doc/indexer.js';
import { createSuccessEnvelope, createErrorEnvelope } from '../protocol.js';

export interface DocIndexOptions {
  path: string;
  extensions?: string[];
}

export async function runDocIndex(options: DocIndexOptions): Promise<number> {
  const absPath = resolve(options.path);
  const exts = options.extensions || ['md', 'txt'];
  const memoryBudgetBytes = getIndexMemoryBudget();

  // Scan and index one file at a time to keep temporary document data bounded.
  let result;
  try {
    result = await buildIndexFromScannedFiles(
      absPath,
      scanFiles(absPath, {
        extensions: exts,
        maxFileSize: Math.min(10 * 1024 * 1024, Math.floor(memoryBudgetBytes / 8)),
      }),
      memoryBudgetBytes,
      exts
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = (err as { code?: string }).code;
    const envelope = createErrorEnvelope(
      code === 'NO_INDEXABLE_FILES' ? 'NO_INDEXABLE_FILES' : code === 'PATH_NOT_FOUND' ? 'PATH_NOT_FOUND' : 'INDEX_FAILED',
      message,
      {
        hint: code === 'NO_INDEXABLE_FILES'
          ? 'Ensure the directory contains matching files'
          : code === 'PATH_NOT_FOUND'
          ? `Ensure the path exists: ${absPath}`
            : code === 'MEMORY_LIMIT_REACHED'
              ? 'Free memory and try again'
              : 'Check disk space and file permissions',
      }
    );
    console.log(JSON.stringify(envelope, null, 2));
    return 1;
  }

  const envelope = createSuccessEnvelope({
    path: absPath,
    indexPath: result.indexPath,
    files: result.meta.files,
    chunks: result.meta.chunks,
    indexedAt: result.meta.indexedAt,
    partial: result.meta.partial,
  });
  console.log(JSON.stringify(envelope, null, 2));
  return 0;
}
