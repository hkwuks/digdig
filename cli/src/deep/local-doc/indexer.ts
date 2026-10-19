/**
 * Indexer — Orama index creation, persistence, and loading.
 *
 * Builds BM25 full-text indexes for document chunks, persists them
 * as JSON files under .digdig/docs/<path-hash>/, and restores them
 * on subsequent searches.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, join, relative, extname, isAbsolute, sep } from 'path';
import { createHash } from 'crypto';
import { freemem, totalmem } from 'os';
import { create, insertMultiple, load, removeMultiple } from '@orama/orama';
import { createTokenizer } from '@orama/tokenizers/mandarin';
import { persist } from '@orama/plugin-data-persistence';
import {
  IndexLocation,
  IndexSourceMetadata,
  IndexedFileMetadata,
  ORAMA_SCHEMA,
  ScannedChunk,
  ScannedFile,
} from './types.js';
import { scanFiles } from './scanner.js';
import { resolveStateRoot } from '../../legacy.js';

const BATCH_SIZE = 500;
const MAX_INDEX_MEMORY_BYTES = 256 * 1024 * 1024;
const TOKENIZER_VERSION = 'mandarin-lowercase-v1';
export const INDEX_REFRESH_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const INDEX_LOCK_STALE_MS = 10 * 60 * 1000;

function createDocumentTokenizer() {
  const tokenizer = createTokenizer();
  const tokenize = tokenizer.tokenize;
  tokenizer.tokenize = (raw, language, property, withCache) =>
    tokenize(raw.toLowerCase(), language, property, withCache);
  return tokenizer;
}

/** Reserve most memory for the process and OS; Orama expands raw text in memory. */
export function calculateIndexMemoryBudget(totalBytes: number, freeBytes: number): number {
  return Math.min(MAX_INDEX_MEMORY_BYTES, totalBytes * 0.05, freeBytes * 0.2);
}

export function getIndexMemoryBudget(): number {
  return calculateIndexMemoryBudget(totalmem(), freemem());
}

// ── Path utilities ────────────────────────────────────────────────────

/** Get the state root directory (cwd-based), whichever name is in effect. */
function getSxngRoot(): string {
  return resolveStateRoot();
}

/** Get docs index directory */
function getDocsDir(): string {
  return join(getSxngRoot(), 'docs');
}

/** Generate deterministic short hash from a path */
export function getIndexPath(rootPath: string): string {
  const abs = resolve(rootPath);
  const hash = createHash('sha256').update(abs).digest('hex').slice(0, 16);
  return join(getDocsDir(), hash);
}

async function withIndexLock<T>(rootPath: string, action: () => Promise<T>): Promise<T> {
  const indexPath = getIndexPath(rootPath);
  mkdirSync(indexPath, { recursive: true });
  const lock = join(indexPath, '.lock');
  try {
    try { mkdirSync(lock); }
    catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > INDEX_LOCK_STALE_MS) rmSync(lock, { recursive: true, force: true });
        else throw new Error('busy');
        mkdirSync(lock);
      } catch {
        throw Object.assign(new Error('Local document index is busy'), { code: 'INDEX_BUSY' });
      }
    }
    return await action();
  } finally {
    try { rmSync(lock, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

function normalizeExtensions(extensions?: string[]): string[] {
  return (extensions ?? ['md', 'txt']).map(extension =>
    extension.startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`
  );
}

function pathWithinRoot(absPath: string, absRoot: string): boolean {
  const fromRoot = relative(absRoot, absPath);
  return fromRoot !== ''
    && !isAbsolute(fromRoot)
    && fromRoot !== '..'
    && !fromRoot.startsWith(`..${sep}`);
}

function fileMetadata(file: ScannedFile): IndexedFileMetadata {
  return { contentHash: file.contentHash, chunkIds: file.chunks.map(chunk => chunk.id) };
}

function runGit(rootPath: string, args: string[]): string | null {
  try {
    return execFileSync('git', ['-C', rootPath, ...args], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

interface GitState {
  head: string;
  changedFiles: string[];
  hasUncommittedTrackedIndexableChanges: boolean;
  hasUntrackedIndexableFiles: boolean;
}

function getGitState(rootPath: string, baseHead?: string, extensions?: string[]): GitState | null {
  const absRoot = resolve(rootPath);
  const gitRoot = runGit(absRoot, ['rev-parse', '--show-toplevel']);
  const head = runGit(absRoot, ['rev-parse', 'HEAD']);
  if (!gitRoot || !head) return null;

  const allowedExtensions = new Set(normalizeExtensions(extensions));
  const pathspec = relative(gitRoot, absRoot).replace(/\\/g, '/');
  const scope = pathspec ? ['--', pathspec] : [];
  const toRootRelativePath = (gitPath: string): string | null => {
    const absPath = resolve(gitRoot, gitPath);
    if (!pathWithinRoot(absPath, absRoot) || !allowedExtensions.has(extname(absPath).toLowerCase())) {
      return null;
    }
    return relative(absRoot, absPath).replace(/\\/g, '/');
  };

  const untrackedOutput = runGit(gitRoot, ['ls-files', '--others', '--exclude-standard', ...scope]);
  if (untrackedOutput === null) return null;
  const hasUntrackedIndexableFiles = untrackedOutput.split(/\r?\n/)
    .filter(Boolean)
    .some(path => toRootRelativePath(path) !== null);

  const listChangedFiles = (base: string): string[] | null => {
    const output = runGit(gitRoot, [
      'diff', '--no-renames', '--name-only', '--diff-filter=ACMRD', base, ...scope,
    ]);
    if (output === null) return null;
    return output.split(/\r?\n/)
      .filter(Boolean)
      .map(toRootRelativePath)
      .filter((path): path is string => path !== null);
  };

  const changedFiles = listChangedFiles(baseHead ?? 'HEAD');
  const uncommittedFiles = baseHead ? listChangedFiles('HEAD') : changedFiles;
  if (changedFiles === null || uncommittedFiles === null) return null;

  return {
    head,
    changedFiles,
    hasUncommittedTrackedIndexableChanges: uncommittedFiles.length > 0,
    hasUntrackedIndexableFiles,
  };
}

async function insertChunks(db: any, chunks: ScannedChunk[]): Promise<void> {
  for (let offset = 0; offset < chunks.length; offset += BATCH_SIZE) {
    await insertMultiple(db, chunks.slice(offset, offset + BATCH_SIZE));
  }
}

function createMeta(
  absRoot: string,
  source: IndexSourceMetadata | undefined,
  partial: boolean,
  memoryBudgetBytes: number
): IndexLocation['meta'] {
  const files = source ? Object.keys(source.files).length : 0;
  const chunks = source
    ? Object.values(source.files).reduce((total, file) => total + file.chunkIds.length, 0)
    : 0;
  return {
    rootPath: absRoot,
    files,
    chunks,
    indexedAt: Date.now(),
    partial,
    memoryBudgetBytes,
    tokenizer: TOKENIZER_VERSION,
    source,
  };
}

async function persistIndex(
  rootPath: string,
  db: any,
  meta: IndexLocation['meta']
): Promise<IndexLocation> {
  const indexPath = getIndexPath(rootPath);
  mkdirSync(indexPath, { recursive: true });
  const json = await persist(db, 'json') as string;
  writeFileSync(join(indexPath, 'index.json'), json, 'utf-8');
  writeFileSync(join(indexPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');
  return { indexPath, meta };
}

// ── Index building ────────────────────────────────────────────────────

export async function buildIndex(
  rootPath: string,
  chunks: ScannedChunk[]
): Promise<IndexLocation> {
  const absRoot = resolve(rootPath);
  const db = await create({
    schema: ORAMA_SCHEMA,
    components: { tokenizer: createDocumentTokenizer() },
  });

  if (chunks.length > 0) {
    await insertChunks(db, chunks);
  }

  const meta: IndexLocation['meta'] = {
    rootPath: absRoot,
    files: new Set(chunks.map(c => c.filePath)).size,
    chunks: chunks.length,
    indexedAt: Date.now(),
    partial: false,
    memoryBudgetBytes: getIndexMemoryBudget(),
    tokenizer: TOKENIZER_VERSION,
  };
  return persistIndex(rootPath, db, meta);
}

/**
 * Build an index incrementally. Each yielded batch is released after insertion.
 * The persisted index remains usable when the memory budget ends the scan early.
 */
export async function buildIndexFromBatches(
  rootPath: string,
  batches: Iterable<ScannedChunk[]>,
  memoryBudgetBytes = getIndexMemoryBudget()
): Promise<IndexLocation> {
  const absRoot = resolve(rootPath);
  const initialHeapBytes = process.memoryUsage().heapUsed;
  const db = await create({
    schema: ORAMA_SCHEMA,
    components: { tokenizer: createDocumentTokenizer() },
  });
  let files = 0;
  let chunks = 0;
  let partial = false;

  for (const batch of batches) {
    const batchBytes = batch.reduce((total, item) =>
      total + Buffer.byteLength(item.content, 'utf-8'), 0);
    const heapUsed = process.memoryUsage().heapUsed - initialHeapBytes;

    if (heapUsed >= memoryBudgetBytes || heapUsed + batchBytes * 4 > memoryBudgetBytes) {
      partial = true;
      break;
    }

    await insertChunks(db, batch);
    files++;
    chunks += batch.length;
  }

  if (chunks === 0) {
    if (partial) {
      throw Object.assign(
        new Error(`Index memory budget (${memoryBudgetBytes} bytes) is too small to index any files in ${absRoot}`),
        { code: 'MEMORY_LIMIT_REACHED' }
      );
    }
    throw Object.assign(new Error(`No indexable files found in ${absRoot}`), { code: 'NO_INDEXABLE_FILES' });
  }

  const meta: IndexLocation['meta'] = {
    rootPath: absRoot,
    files,
    chunks,
    indexedAt: Date.now(),
    partial,
    memoryBudgetBytes,
    tokenizer: TOKENIZER_VERSION,
  };
  return persistIndex(rootPath, db, meta);
}

/** Build a complete index and record file hashes for later incremental refreshes. */
export async function buildIndexFromScannedFiles(
  rootPath: string,
  files: Iterable<ScannedFile>,
  memoryBudgetBytes = getIndexMemoryBudget(),
  extensions?: string[]
): Promise<IndexLocation> {
  const absRoot = resolve(rootPath);
  const db = await create({
    schema: ORAMA_SCHEMA,
    components: { tokenizer: createDocumentTokenizer() },
  });
  const source: IndexSourceMetadata = {
    files: {},
    extensions: normalizeExtensions(extensions),
  };
  const initialHeapBytes = process.memoryUsage().heapUsed;
  let partial = false;

  for (const file of files) {
    const fileBytes = file.chunks.reduce((total, chunk) =>
      total + Buffer.byteLength(chunk.content, 'utf-8'), 0);
    const heapUsed = process.memoryUsage().heapUsed - initialHeapBytes;
    if (heapUsed >= memoryBudgetBytes || heapUsed + fileBytes * 4 > memoryBudgetBytes) {
      partial = true;
      break;
    }
    await insertChunks(db, file.chunks);
    source.files[file.filePath] = fileMetadata(file);
  }

  if (Object.keys(source.files).length === 0) {
    if (partial) {
      throw Object.assign(
        new Error(`Index memory budget (${memoryBudgetBytes} bytes) is too small to index any files in ${absRoot}`),
        { code: 'MEMORY_LIMIT_REACHED' }
      );
    }
    throw Object.assign(new Error(`No indexable files found in ${absRoot}`), { code: 'NO_INDEXABLE_FILES' });
  }

  const git = getGitState(absRoot, undefined, source.extensions);
  if (git && !git.hasUncommittedTrackedIndexableChanges && !git.hasUntrackedIndexableFiles) {
    source.git = { head: git.head };
  }
  return persistIndex(rootPath, db, createMeta(absRoot, source, partial, memoryBudgetBytes));
}

async function replaceFile(db: any, source: IndexSourceMetadata, file: ScannedFile): Promise<void> {
  const previous = source.files[file.filePath];
  if (previous?.contentHash === file.contentHash) return;
  if (previous?.chunkIds.length) await removeMultiple(db, previous.chunkIds, BATCH_SIZE);
  await insertChunks(db, file.chunks);
  source.files[file.filePath] = fileMetadata(file);
}

async function removeFile(db: any, source: IndexSourceMetadata, filePath: string): Promise<void> {
  const previous = source.files[filePath];
  if (!previous) return;
  if (previous.chunkIds.length) await removeMultiple(db, previous.chunkIds, BATCH_SIZE);
  delete source.files[filePath];
}

function exceedsMemoryBudget(
  file: ScannedFile,
  initialHeapBytes: number,
  memoryBudgetBytes: number
): boolean {
  const fileBytes = file.chunks.reduce((total, chunk) =>
    total + Buffer.byteLength(chunk.content, 'utf-8'), 0);
  const heapUsed = process.memoryUsage().heapUsed - initialHeapBytes;
  return heapUsed >= memoryBudgetBytes || heapUsed + fileBytes * 4 > memoryBudgetBytes;
}

async function refreshWithHashes(
  rootPath: string,
  db: any,
  source: IndexSourceMetadata,
  memoryBudgetBytes: number
): Promise<boolean> {
  const initialHeapBytes = process.memoryUsage().heapUsed;
  const seen = new Set<string>();
  for (const file of scanFiles(rootPath, {
    extensions: source.extensions,
    maxFileSize: Math.min(10 * 1024 * 1024, Math.floor(memoryBudgetBytes / 8)),
  })) {
    if (exceedsMemoryBudget(file, initialHeapBytes, memoryBudgetBytes)) return true;
    seen.add(file.filePath);
    await replaceFile(db, source, file);
  }
  for (const filePath of Object.keys(source.files)) {
    if (!seen.has(filePath)) await removeFile(db, source, filePath);
  }
  return false;
}

async function refreshWithGit(
  rootPath: string,
  db: any,
  source: IndexSourceMetadata,
  changedFiles: string[],
  memoryBudgetBytes: number
): Promise<boolean> {
  const initialHeapBytes = process.memoryUsage().heapUsed;
  const pending = new Set(changedFiles);
  for (const file of scanFiles(rootPath, { extensions: source.extensions }, pending)) {
    if (exceedsMemoryBudget(file, initialHeapBytes, memoryBudgetBytes)) return true;
    pending.delete(file.filePath);
    await replaceFile(db, source, file);
  }
  for (const filePath of pending) await removeFile(db, source, filePath);
  return false;
}

/** Refresh a complete index by Git diff when possible, otherwise by file hashes. */
export async function refreshIndex(rootPath: string): Promise<IndexLocation> {
  return withIndexLock(rootPath, async () => refreshIndexUnlocked(rootPath));
}

async function refreshIndexUnlocked(rootPath: string): Promise<IndexLocation> {
  const absRoot = resolve(rootPath);
  const previous = getIndexMeta(absRoot);
  const source = previous?.source;
  if (!previous || previous.partial || !source) {
    return buildIndexFromScannedFiles(absRoot, scanFiles(absRoot));
  }

  const memoryBudgetBytes = getIndexMemoryBudget();
  const db = await loadIndex(absRoot);
  const git = getGitState(absRoot, source.git?.head, source.extensions);
  let partial = false;
  if (git && source.git
    && !git.hasUncommittedTrackedIndexableChanges
    && !git.hasUntrackedIndexableFiles) {
    partial = await refreshWithGit(absRoot, db, source, git.changedFiles, memoryBudgetBytes);
    if (!partial) source.git = { head: git.head };
  } else {
    partial = await refreshWithHashes(absRoot, db, source, memoryBudgetBytes);
    if (!partial) {
      const currentGit = getGitState(absRoot, undefined, source.extensions);
      if (currentGit && !currentGit.hasUncommittedTrackedIndexableChanges && !currentGit.hasUntrackedIndexableFiles) {
        source.git = { head: currentGit.head };
      }
      else delete source.git;
    }
  }

  return persistIndex(absRoot, db, createMeta(absRoot, source, partial, memoryBudgetBytes));
}

/** Refresh only when the index has exceeded its maximum age. */
export async function refreshIndexIfStale(rootPath: string): Promise<boolean> {
  const meta = getIndexMeta(rootPath);
  if (!meta || Date.now() - meta.indexedAt < INDEX_REFRESH_INTERVAL_MS) return false;
  await refreshIndex(rootPath);
  return true;
}

// ── Index loading ─────────────────────────────────────────────────────

export async function loadIndex(rootPath: string): Promise<any> {
  const indexPath = getIndexPath(rootPath);
  const data = readFileSync(join(indexPath, 'index.json'), 'utf-8');
  const db = await create({
    schema: ORAMA_SCHEMA,
    components: { tokenizer: createDocumentTokenizer() },
  });
  load(db, JSON.parse(data));
  return db;
}

// ── Index detection ───────────────────────────────────────────────────

export function hasIndex(rootPath: string): boolean {
  const indexPath = getIndexPath(rootPath);
  return existsSync(join(indexPath, 'index.json'))
    && getIndexMeta(rootPath)?.tokenizer === TOKENIZER_VERSION;
}

// ── Index metadata ────────────────────────────────────────────────────

export function getIndexMeta(rootPath: string): IndexLocation['meta'] | null {
  const indexPath = getIndexPath(rootPath);
  const metaFile = join(indexPath, 'meta.json');
  if (!existsSync(metaFile)) return null;
  try {
    return JSON.parse(readFileSync(metaFile, 'utf-8'));
  } catch {
    return null;
  }
}
