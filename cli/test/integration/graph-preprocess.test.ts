import { describe, it, expect } from 'vitest';
import { graphPreprocess } from '../../src/deep/graph-preprocess.js';
import { initSessionDir, appendSessionResults, updateSessionGraph, mutateSessionGraph } from '../../src/deep/session.js';
import { entityId, resultId } from '../../src/deep/graph.js';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('graph-preprocess (integration)', () => {
    let sessionDir: string;

    beforeEach(() => {
        sessionDir = mkdtempSync(join(tmpdir(), 'sxng-pp-test-'));
    });

    afterEach(() => {
        rmSync(sessionDir, { recursive: true, force: true });
    });

    it('runs full pipeline on session with content', () => {
        initSessionDir(sessionDir, 'test', 'test session', 'rust async');
        appendSessionResults(sessionDir, [
            { url: 'https://tokio.rs', title: 'Tokio Runtime', contentType: 'extracted', content: 'Tokio is an asynchronous runtime for the Rust programming language', extractor: 'test', origins: [{ tool: 'test', query: 'rust async' }] },
            { url: 'https://async.rs', title: 'Async Std', contentType: 'extracted', content: 'async-std provides async standard library for Rust', extractor: 'test', origins: [{ tool: 'test', query: 'rust async' }] },
            { url: 'https://blog.rust-lang.org/async', title: 'Rust Async Ecosystem', contentType: 'extracted', content: 'The Rust async ecosystem includes tokio and async runtimes', extractor: 'test', origins: [{ tool: 'test', query: 'rust async' }] },
        ]);
        updateSessionGraph(sessionDir, 'rust async', [
            { url: 'https://tokio.rs', title: 'Tokio Runtime', content: 'Verified Tokio.', extractedAt: 1 },
            { url: 'https://async.rs', title: 'Async Std', content: 'Verified Async.', extractedAt: 1 },
        ]);

        const result = graphPreprocess(sessionDir);

        expect(result.totalResults).toBe(3);
        expect(result.resultsWithContent).toBe(3);
        expect(result.coOccurrences.length).toBeGreaterThan(0);
        expect(result.existingEntities).toEqual([]);
        expect(result.termFrequencies.length).toBeGreaterThan(0);
    });

    it('handles session with no content results', () => {
        initSessionDir(sessionDir);
        appendSessionResults(sessionDir, [
            { url: 'https://a.com', title: 'A' },
        ]);

        const result = graphPreprocess(sessionDir);

        expect(result.totalResults).toBe(1);
        expect(result.resultsWithContent).toBe(0);
        expect(result.coOccurrences).toEqual([]);
    });

    it('includes existing entities from graph', () => {
        initSessionDir(sessionDir);
        appendSessionResults(sessionDir, [
            { url: 'https://a.com', title: 'A', contentType: 'extracted', content: 'tokio runtime', extractor: 'test' },
        ]);

        mutateSessionGraph(sessionDir, graph => {
            graph.mergeNode(entityId('tokio'), { type: 'entity', label: 'tokio', entityType: 'runtime' });
        });

        const result = graphPreprocess(sessionDir);
        expect(result.existingEntities.length).toBe(1);
        expect(result.existingEntities[0].label).toBe('tokio');
    });

    it('lists stable IDs, revisions, and approval state for extracted bodies', () => {
        initSessionDir(sessionDir);
        appendSessionResults(sessionDir, [{
            url: 'https://tokio.rs',
            title: 'Tokio Runtime',
            contentType: 'extracted', content: 'Tokio is an asynchronous Rust runtime.', extractor: 'test',
            origins: [{ tool: 'sxng', query: 'rust async round one' }],
        }]);
        appendSessionResults(sessionDir, [{
            url: 'https://tokio.rs/blog',
            title: 'Tokio Blog',
            contentType: 'extracted', content: 'Tokio supports asynchronous applications.', extractor: 'test',
            origins: [{ tool: 'sxng', query: 'rust async round two' }],
        }]);
        const result = graphPreprocess(sessionDir);

        expect(result.resultProvenance).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: resultId('https://tokio.rs'), revision: 1, url: 'https://tokio.rs', approval: 'pending' }),
            expect.objectContaining({ id: resultId('https://tokio.rs/blog'), revision: 1, url: 'https://tokio.rs/blog', approval: 'pending' }),
        ]));
    });
});
