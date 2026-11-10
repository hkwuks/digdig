import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { withSessionRead, withSessionWrite } from '../../src/deep/session-store.js';
import { readResults, writeResults } from '../../src/deep/session-store-results.js';
import type { SessionResult } from '../../src/deep/session.js';

describe('SQLite result storage', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dg-results-')); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('round-trips records while keeping content and origins in their own tables', () => {
        const result: SessionResult = { id: 'r1', revision: 3, url: 'https://example.com', title: 'A', contentType: 'extracted', status: 'approved', content: 'body', extractor: 'test', extractedAt: 1, origins: [{ tool: 'test', query: 'q', round: 1 }], extra: { kept: true } };
        withSessionWrite(dir, db => writeResults(db, [result], 2));
        expect(withSessionRead(dir, db => readResults(db))).toMatchObject({ data: { rounds: 2, results: [result] } });
        withSessionRead(dir, db => {
            const discovery = JSON.parse(String(db.prepare('SELECT data FROM results').get()?.data));
            expect(discovery).not.toHaveProperty('content');
            expect(discovery).not.toHaveProperty('origins');
        });
    });
});
