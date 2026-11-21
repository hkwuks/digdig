/**
 * Scanner - file scanning and structure-aware chunking.
 */

import { readFileSync, statSync, readdirSync } from 'fs';
import { resolve, extname, join, relative, isAbsolute, sep } from 'path';
import { createHash } from 'crypto';
import { chunk } from 'chunk-smart';
import { ScannedChunk, ScannedFile, ScannerOptions } from './types.js';

const DEFAULT_OPTIONS: Required<ScannerOptions> = {
  extensions: ['md', 'txt'],
  maxFileSize: 10 * 1024 * 1024,
};

interface FrontmatterResult {
  title: string;
  body: string;
}

interface RawChunk {
  content: string;
  headings: string[];
}

interface ScanContext {
  absRoot: string;
  options: Required<ScannerOptions>;
  extensions: Set<string>;
}

function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return { title: '', body: content };

  const titleMatch = match[1].match(/^title:\s*(.+)$/m);
  return {
    title: titleMatch ? titleMatch[1].trim().replace(/^['"](.*)['"]$/, '$1') : '',
    body: content.slice(match[0].length),
  };
}

function splitParagraphs(text: string): RawChunk[] {
  const parts = text.split(/\n\n+/).map(part => part.trim()).filter(Boolean);
  if (parts.length === 0) return [];
  return parts.map(content => ({ content, headings: [] }));
}

function makeId(filePath: string, chunkIndex: number): string {
  return createHash('sha256').update(`${filePath}\0${chunkIndex}`).digest('hex').slice(0, 16);
}

function createScanContext(rootPath: string, options?: ScannerOptions): ScanContext {
  const resolvedOptions = { ...DEFAULT_OPTIONS, ...options };
  const absRoot = resolve(rootPath);

  try {
    statSync(absRoot);
  } catch {
    throw Object.assign(new Error(`Path not found: ${absRoot}`), { code: 'PATH_NOT_FOUND' });
  }

  return {
    absRoot,
    options: resolvedOptions,
    extensions: new Set(resolvedOptions.extensions.map(ext =>
      ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
    )),
  };
}

function* findFiles(dir: string, extensions: Set<string>): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const absPath = join(dir, entry);
    try {
      const stat = statSync(absPath);
      if (stat.isDirectory()) {
        yield* findFiles(absPath, extensions);
      } else if (stat.isFile() && extensions.has(extname(absPath).toLowerCase())) {
        yield absPath;
      }
    } catch {
      // Skip entries which disappear or cannot be inspected.
    }
  }
}

function scanFile(absFile: string, context: ScanContext): ScannedFile | null {
  const relFile = relative(context.absRoot, absFile).replace(/\\/g, '/');

  try {
    const stat = statSync(absFile);
    if (stat.size > context.options.maxFileSize) {
      console.warn(`[doc-index] Skipping file larger than ${context.options.maxFileSize} bytes: ${relFile}`);
      return null;
    }
  } catch {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(absFile, 'utf-8');
  } catch {
    console.warn(`[doc-index] Skipping unreadable file: ${relFile}`);
    return null;
  }

  if (!content.trim()) return null;

  const { title: frontmatterTitle, body } = parseFrontmatter(content);
  const title = frontmatterTitle || relFile;
  let rawChunks: RawChunk[];

  if (extname(absFile).toLowerCase() === '.md') {
    try {
      rawChunks = (chunk as any)(body, { mode: 'markdown' }).map((item: any) => ({
        content: item.content,
        headings: (item.metadata?.headings || []).map((heading: string) => heading),
      }));
    } catch {
      rawChunks = splitParagraphs(body);
    }
  } else {
    rawChunks = splitParagraphs(body);
  }

  const chunks: ScannedChunk[] = [];
  for (let index = 0; index < rawChunks.length; index++) {
    const rawChunk = rawChunks[index];
    const chunkContent = rawChunk.content.trim();
    if (!chunkContent) continue;

    chunks.push({
      id: makeId(relFile, index),
      filePath: relFile,
      title,
      content: chunkContent,
      // Section headings only. The document title is already `title`; prefixing
      // it here made `headings` carry two different things, so a file whose
      // frontmatter title matches its first heading had that heading twice and
      // no consumer could tell which copy was the document title.
      headings: rawChunk.headings,
      chunkIndex: index,
      totalChunks: rawChunks.length,
    });
  }

  return chunks.length > 0 ? {
    filePath: relFile,
    contentHash: createHash('sha256').update(content).digest('hex'),
    chunks,
  } : null;
}

function isPathWithinRoot(absPath: string, absRoot: string): boolean {
  const pathFromRoot = relative(absRoot, absPath);
  return pathFromRoot !== ''
    && !isAbsolute(pathFromRoot)
    && pathFromRoot !== '..'
    && !pathFromRoot.startsWith(`..${sep}`);
}

/** Yield one file at a time, with a hash for incremental change detection. */
export function* scanFiles(
  rootPath: string,
  options?: ScannerOptions,
  filePaths?: Iterable<string>
): Generator<ScannedFile> {
  const context = createScanContext(rootPath, options);
  const candidates = filePaths
    ? Array.from(filePaths, filePath => join(context.absRoot, ...filePath.split('/')))
    : findFiles(context.absRoot, context.extensions);

  for (const absFile of candidates) {
    if (!isPathWithinRoot(absFile, context.absRoot)
      || !context.extensions.has(extname(absFile).toLowerCase())) continue;
    const scanned = scanFile(absFile, context);
    if (scanned) yield scanned;
  }
}

/** Yield one file batch at a time so callers can index and release them. */
export function* scanBatches(rootPath: string, options?: ScannerOptions): Generator<ScannedChunk[]> {
  for (const file of scanFiles(rootPath, options)) {
    yield file.chunks;
  }
}

export function scan(rootPath: string, options?: ScannerOptions): ScannedChunk[] {
  const chunks: ScannedChunk[] = [];
  for (const batch of scanBatches(rootPath, options)) chunks.push(...batch);
  return chunks;
}
