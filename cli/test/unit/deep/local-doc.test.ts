import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname, resolve } from 'path';
import { tmpdir } from 'os';
import { scan, scanBatches, scanFiles } from '../../src/deep/local-doc/scanner.js';
import { buildIndex, buildIndexFromBatches, buildIndexFromScannedFiles, calculateIndexMemoryBudget, getIndexMeta, getIndexPath, hasIndex, loadIndex, refreshIndex, refreshIndexIfStale } from '../../src/deep/local-doc/indexer.js';
import { docSearch } from '../../src/deep/local-doc/searcher.js';
import { appendSessionResults, loadSessionResults, loadSessionRounds, resolveSessionPath } from '../../src/deep/session.js';

// Helper: create temp directory with test files
function createTestDir(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), 'sxng-ldoc-'));
    for (const [relPath, content] of Object.entries(files)) {
        const absPath = join(dir, relPath);
        mkdirSync(dirname(absPath), { recursive: true });
        writeFileSync(absPath, content, 'utf-8');
    }
    return dir;
}

function runGit(dir: string, args: string[]): void {
    execFileSync('git', ['-C', dir, ...args], { stdio: 'ignore' });
}

async function withIndexRoot<T>(fn: () => Promise<T>): Promise<T> {
    const originalCwd = process.cwd();
    const indexRoot = mkdtempSync(join(tmpdir(), 'sxng-index-root-'));
    process.chdir(indexRoot);
    try {
        return await fn();
    } finally {
        process.chdir(originalCwd);
        rmSync(indexRoot, { recursive: true, force: true });
    }
}

// ── Scanner Tests ────────────────────────────────────────────────

describe('local-doc scanner', () => {
    let testDir: string;

    afterEach(() => {
        if (testDir) rmSync(testDir, { recursive: true, force: true });
    });

    it('scans markdown files and chunks by heading', () => {
        testDir = createTestDir({
            'doc.md': '# Title\n\nIntro text\n\n## Section 1\n\nContent one\n\n## Section 2\n\nContent two',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBe(3);
        expect(chunks[0].filePath).toBe('doc.md');
        expect(chunks[0].content).toContain('Intro text');
        expect(chunks[1].content).toContain('Content one');
        expect(chunks[2].content).toContain('Content two');
    });

    it('parses YAML frontmatter title', () => {
        testDir = createTestDir({
            'note.md': '---\ntitle: My Note\n---\n\n# Heading\n\nContent here',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        expect(chunks[0].title).toBe('My Note');
    });

    it('uses filename as fallback when no frontmatter title', () => {
        testDir = createTestDir({
            'no-frontmatter.md': '# Just Content\n\nPlain text here',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBeGreaterThanOrEqual(1);
        expect(chunks[0].title).toBe('no-frontmatter.md');
    });

    it('splits txt files by paragraphs', () => {
        testDir = createTestDir({
            'notes.txt': 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBe(3);
        expect(chunks[0].content).toContain('First paragraph');
        expect(chunks[1].content).toContain('Second paragraph');
        expect(chunks[2].content).toContain('Third paragraph');
    });

    it('filters by custom extensions', () => {
        testDir = createTestDir({
            'a.md': '# A\n\nContent',
            'b.txt': 'Plain text',
            'c.json': '{"key": "value"}',
        });
        const chunks = scan(testDir, { extensions: ['json'] });
        expect(chunks.length).toBe(1);
        expect(chunks[0].filePath).toBe('c.json');
    });

    it('skips files > maxFileSize', () => {
        testDir = createTestDir({
            'small.md': '# Small\n\ncontent',
        });
        // Write a large file directly
        const largePath = join(testDir, 'large.md');
        writeFileSync(largePath, '# ' + 'x'.repeat(1024 * 1024)); // ~1MB of content
        const chunks = scan(testDir, { maxFileSize: 100 }); // 100 bytes max
        expect(chunks.length).toBe(1); // only small.md
        expect(chunks[0].filePath).toBe('small.md');
    });

    it('throws for nonexistent path', () => {
        expect(() => scan(resolve('/nonexistent-path-12345'))).toThrow('Path not found');
    });

    it('returns empty array for path with no matching files', () => {
        testDir = createTestDir({});
        const chunks = scan(testDir);
        expect(chunks).toEqual([]);
    });

    it('skips empty files', () => {
        testDir = createTestDir({
            'empty.md': '',
            'real.md': '# Real\n\nContent',
        });
        const chunks = scan(testDir);
        expect(chunks.length).toBe(1);
        expect(chunks[0].filePath).toBe('real.md');
    });

    it('yields one file batch at a time for streaming indexing', () => {
        testDir = createTestDir({
            'a.md': '# A\n\nFirst document',
            'b.txt': 'Second document',
        });

        const batches = scanBatches(testDir);
        const first = batches.next();
        const second = batches.next();

        expect(first.value?.[0].filePath).toBe('a.md');
        expect(second.value?.[0].filePath).toBe('b.txt');
    });
});

// ── Indexer Tests ─────────────────────────────────────────────────

describe('local-doc indexer', () => {
    let testDir: string;
    let sxngDir: string;

    beforeEach(() => {
        // Create test docs
        testDir = createTestDir({
            'rust.md': '---\ntitle: Rust Guide\n---\n\n# Async\n\nAsync in Rust uses futures.\n\n# Ownership\n\nOwnership is unique to Rust.',
        });
    });

    afterEach(() => {
        if (testDir) rmSync(testDir, { recursive: true, force: true });
        if (sxngDir) rmSync(sxngDir, { recursive: true, force: true });
    });

    it('derives the index budget from total memory, free memory, and a fixed ceiling', () => {
        const mib = 1024 * 1024;

        expect(calculateIndexMemoryBudget(8 * 1024 * mib, 6 * 1024 * mib)).toBe(256 * mib);
        expect(calculateIndexMemoryBudget(4 * 1024 * mib, 128 * mib)).toBeCloseTo(25.6 * mib, 0);
        expect(calculateIndexMemoryBudget(4 * 1024 * mib, 8 * mib)).toBeCloseTo(1.6 * mib, 0);
    });

    it('persists the completed batches when the memory budget is reached', async () => {
        const batches = [
            [{ id: 'one', filePath: 'one.txt', title: 'one', content: 'a'.repeat(10), headings: [], chunkIndex: 0, totalChunks: 1 }],
            [{ id: 'two', filePath: 'two.txt', title: 'two', content: 'b'.repeat(300_000), headings: [], chunkIndex: 0, totalChunks: 1 }],
        ];

        const result = await buildIndexFromBatches(testDir, batches, 1024 * 1024);

        expect(result.meta).toMatchObject({ files: 1, chunks: 1, partial: true, memoryBudgetBytes: 1024 * 1024 });
        expect(hasIndex(testDir)).toBe(true);
    });

    it('reports an exhausted memory budget when no batch can be indexed', async () => {
        const batches = [
            [{ id: 'one', filePath: 'one.txt', title: 'one', content: 'a'.repeat(300_000), headings: [], chunkIndex: 0, totalChunks: 1 }],
        ];

        await expect(buildIndexFromBatches(testDir, batches, 1024 * 1024)).rejects.toMatchObject({
            code: 'MEMORY_LIMIT_REACHED',
        });
    });

    it('builds index from scanned chunks', async () => {
        const chunks = scan(testDir);
        expect(chunks.length).toBeGreaterThan(0);

        const result = await buildIndex(testDir, chunks);
        expect(result.meta.files).toBe(1);
        expect(result.meta.chunks).toBe(2); // 2 sections
        expect(result.meta.rootPath).toBe(testDir);
        expect(result.meta.indexedAt).toBeGreaterThan(0);
        expect(result.indexPath).toContain(join('.digdig', 'docs'));
    });

    it('searches Chinese words after persisting and loading an index', async () => {
        const chunks = [{
            id: 'chinese',
            filePath: 'guide.md',
            title: 'Guide',
            content: '\u4e2d\u6587\u90e8\u7f72\u6743\u9650\u914d\u7f6e',
            headings: [],
            chunkIndex: 0,
            totalChunks: 1,
        }];

        await buildIndex(testDir, chunks);
        const db = await loadIndex(testDir);
        const { search } = await import('@orama/orama');
        const result = await search(db, { term: '\u90e8\u7f72', mode: 'fulltext', limit: 5 });

        expect(result.hits).toHaveLength(1);
    });

    it('persists and restores index', async () => {
        sxngDir = mkdtempSync(join(tmpdir(), 'sxng-root-'));
        const origCwd = process.cwd;
        // Temporarily change cwd so .sxng lands in our temp dir
        // Instead, just build and check hasIndex
        const chunks = scan(testDir);
        await buildIndex(testDir, chunks);

        expect(hasIndex(testDir)).toBe(true);

        // Load and verify
        const db = await loadIndex(testDir);
        expect(db).toBeTruthy();

        // Search restored index
        const { search } = await import('@orama/orama');
        const r = await search(db, { term: 'async', mode: 'fulltext', limit: 5 });
        expect(r.hits.length).toBeGreaterThanOrEqual(1);
    });

    it('returns index metadata', async () => {
        const chunks = scan(testDir);
        await buildIndex(testDir, chunks);

        const meta = getIndexMeta(testDir);
        expect(meta).not.toBeNull();
        expect(meta!.files).toBe(1);
        expect(meta!.chunks).toBe(2);
    });

    it('reports no index when none exists', () => {
        // Use a directory that exists but has no .sxng/docs/ index
        const noIndexDir = mkdtempSync(join(tmpdir(), 'sxng-noindex-'));
        try {
            expect(hasIndex(noIndexDir)).toBe(false);
            expect(getIndexMeta(noIndexDir)).toBeNull();
        } finally {
            rmSync(noIndexDir, { recursive: true, force: true });
        }
    });

    it('handles empty chunks list gracefully', async () => {
        const result = await buildIndex(testDir, []);
        expect(result.meta.files).toBe(0);
        expect(result.meta.chunks).toBe(0);
    });

    it('updates changed documents using the content-hash manifest', async () => {
        await withIndexRoot(async () => {
            const initial = await buildIndexFromScannedFiles(testDir, scanFiles(testDir));
            expect(initial.meta.source?.git).toBeUndefined();

            writeFileSync(join(testDir, 'rust.md'), '# Updated\n\nIncremental indexing stores new content.', 'utf-8');
            await refreshIndex(testDir);

            const db = await loadIndex(testDir);
            const { search } = await import('@orama/orama');
            expect((await search(db, { term: 'incremental', mode: 'fulltext', limit: 5 })).hits).toHaveLength(1);
            expect((await search(db, { term: 'ownership', mode: 'fulltext', limit: 5 })).hits).toHaveLength(0);
        });
    });

    it('uses Git changes for tracked documents and hashes for untracked documents', async () => {
        await withIndexRoot(async () => {
            runGit(testDir, ['init']);
            runGit(testDir, ['config', 'user.email', 'test@example.com']);
            runGit(testDir, ['config', 'user.name', 'Test User']);
            runGit(testDir, ['add', 'rust.md']);
            runGit(testDir, ['commit', '-m', 'Initial documents']);
            const originalContent = readFileSync(join(testDir, 'rust.md'), 'utf-8');

            const initial = await buildIndexFromScannedFiles(testDir, scanFiles(testDir));
            expect(initial.meta.source?.git?.head).toBeTruthy();

            writeFileSync(join(testDir, 'rust.md'), '# Updated\n\nGit diff detects committed changes.', 'utf-8');
            runGit(testDir, ['add', 'rust.md']);
            runGit(testDir, ['commit', '-m', 'Update documents']);
            await refreshIndex(testDir);
            expect(getIndexMeta(testDir)?.source?.git?.head).not.toBe(initial.meta.source?.git?.head);

            writeFileSync(join(testDir, 'rust.md'), '# Updated\n\nGit diff detects uncommitted changes.', 'utf-8');
            await refreshIndex(testDir);
            expect(getIndexMeta(testDir)?.source?.git).toBeUndefined();

            writeFileSync(join(testDir, 'rust.md'), originalContent, 'utf-8');
            await refreshIndex(testDir);

            writeFileSync(join(testDir, 'untracked.md'), '# Local\n\nHash fallback detects this document.', 'utf-8');
            await refreshIndex(testDir);

            const db = await loadIndex(testDir);
            const { search } = await import('@orama/orama');
            expect((await search(db, { term: 'git diff', mode: 'fulltext', limit: 5 })).hits).toHaveLength(0);
            expect((await search(db, { term: 'hash fallback', mode: 'fulltext', limit: 5 })).hits).toHaveLength(1);
            expect((await search(db, { term: 'ownership', mode: 'fulltext', limit: 5 })).hits).toHaveLength(1);
        });
    }, 15_000);

    it('only refreshes a stale index', async () => {
        await withIndexRoot(async () => {
            await buildIndexFromScannedFiles(testDir, scanFiles(testDir));
            expect(await refreshIndexIfStale(testDir)).toBe(false);

            const metaPath = join(getIndexPath(testDir), 'meta.json');
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
            meta.indexedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
            writeFileSync(metaPath, JSON.stringify(meta), 'utf-8');

            expect(await refreshIndexIfStale(testDir)).toBe(true);
        });
    });
});

// ── Searcher Tests ────────────────────────────────────────────────

describe('local-doc searcher', () => {
    let testDir: string;
    let sessionDir: string;

    beforeEach(() => {
        testDir = createTestDir({
            'guide.md': '---\ntitle: Programming Guide\n---\n\n# Async\n\nRust async with tokio runtime.\n\n# Sync\n\nSynchronous code is simpler.',
            'deploy.txt': 'Deployment uses Docker.\n\nConfiguration via environment.\n\nHealth checks required.',
        });
    });

    afterEach(() => {
        if (testDir) rmSync(testDir, { recursive: true, force: true });
        if (sessionDir) rmSync(sessionDir, { recursive: true, force: true });
    });

    it('auto-indexes and searches, returns SessionResult[]', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'async tokio',
            path: testDir,
            topK: 5,
        });

        expect(result.added).toBeGreaterThanOrEqual(1);
        expect(result.results.length).toBeGreaterThanOrEqual(1);
        expect(result.partial).toBe(false);

        const r = result.results[0];
        expect(r.contentType).toBe('extracted');
        expect(r.extractor).toBe('local-index');
        expect(r.url).toMatch(/^file:\/\//);
        expect(r.score).toBeGreaterThan(0);
        expect(r.title).toBeTruthy();
        expect(r.content).toBeTruthy();
        expect(r.origins).toEqual([{ tool: 'local-index', query: 'async tokio' }]);
    });

    it('returns formatted results with correct fields', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'deployment',
            path: testDir,
            topK: 3,
        });

        expect(result.results.length).toBeGreaterThanOrEqual(1);
        const r = result.results[0];
        expect(r).toHaveProperty('url');
        expect(r).toHaveProperty('title');
        expect(r).toHaveProperty('content');
        expect(r).toHaveProperty('contentType', 'extracted');
        expect(r).toHaveProperty('extractor', 'local-index');
        expect(r).toHaveProperty('score');
        expect(r).toHaveProperty('filePath');
        expect(r).toHaveProperty('headings');
        expect(r).toHaveProperty('chunkIndex');
        expect(r.score).toBeGreaterThan(0);
    });

    it('limits results with topK', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'rust', // matches both Async and Sync sections
            path: testDir,
            topK: 1,
        });

        expect(result.results.length).toBeLessThanOrEqual(1);
    });

    it('does not increment session round', async () => {
        sessionDir = resolveSessionPath('new');

        // First add some web-like results
        appendSessionResults(sessionDir, [
            { url: 'https://example.com', title: 'Web Result', contentType: 'search', origins: [{ tool: 'sxng', query: 'web result' }] },
        ]);

        const roundsBefore = loadSessionRounds(sessionDir);
        expect(roundsBefore).toBe(1); // first add incremented to 1

        // Add local results
        await docSearch({
            session: sessionDir,
            query: 'async',
            path: testDir,
            topK: 5,
        });

        const roundsAfter = loadSessionRounds(sessionDir);
        expect(roundsAfter).toBe(1); // no increment from doc-search
    });

    it('keeps distinct local chunks that share a document title', async () => {
        await withIndexRoot(async () => {
            writeFileSync(join(testDir, 'notes.txt'), [
                'deploy alpha configuration',
                'deploy beta configuration',
                'deploy gamma configuration',
            ].join('\n\n'), 'utf-8');

            const first = await docSearch({
                session: 'local-chunks',
                query: 'deploy',
                path: testDir,
                topK: 5,
            });

            const noteResults = first.results.filter(result => result.filePath === 'notes.txt');
            expect(noteResults.length).toBeGreaterThan(1);
            expect(first.added).toBe(first.results.length);
            const sessionResults = loadSessionResults(first.session);
            expect(sessionResults).toHaveLength(first.results.length);
            expect(sessionResults.filter(result => result.filePath === 'notes.txt'))
                .toHaveLength(noteResults.length);

            const second = await docSearch({
                session: 'local-chunks',
                query: 'deploy',
                path: testDir,
                topK: 5,
            });
            expect(second.added).toBe(0);
        });
    });

    it('refreshes a stale index before searching', async () => {
        await withIndexRoot(async () => {
            const initial = await docSearch({
                session: 'stale-index',
                query: 'tokio',
                path: testDir,
                topK: 5,
            });
            expect(initial.results).toHaveLength(1);

            const metaPath = join(getIndexPath(testDir), 'meta.json');
            const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
            meta.indexedAt = Date.now() - 31 * 24 * 60 * 60 * 1000;
            writeFileSync(metaPath, JSON.stringify(meta), 'utf-8');
            writeFileSync(join(testDir, 'guide.md'), '# Guide\n\nFresh search content.', 'utf-8');

            const refreshed = await docSearch({
                session: 'stale-index',
                query: 'fresh search',
                path: testDir,
                topK: 5,
            });
            expect(refreshed.results).toHaveLength(1);
        });
    });

    it('rejects empty query', async () => {
        await expect(docSearch({
            session: 'test',
            query: '',
            path: testDir,
            topK: 5,
        })).rejects.toThrow(/Query is empty/i);
    });

    it('rejects path with no indexable files', async () => {
        const emptyDir = mkdtempSync(join(tmpdir(), 'sxng-empty-'));
        try {
            await expect(docSearch({
                session: 'test',
                query: 'anything',
                path: emptyDir,
                topK: 5,
            })).rejects.toThrow(/No indexable files/i);
        } finally {
            rmSync(emptyDir, { recursive: true, force: true });
        }
    });

    it('supports custom field boost', async () => {
        sessionDir = resolveSessionPath('new');

        const result = await docSearch({
            session: sessionDir,
            query: 'tokio',
            path: testDir,
            topK: 5,
            boost: { title: 5, content: 1 },
        });

        expect(result.results.length).toBeGreaterThanOrEqual(1);
        // Result should have a valid score
        expect(result.results[0].score).toBeGreaterThan(0);
    });
});
