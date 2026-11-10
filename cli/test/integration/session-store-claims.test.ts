import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { withSessionRead, withSessionWrite } from '../../src/deep/session-store.js';
import { readRecords, writeRecords } from '../../src/deep/session-store-claims.js';

describe('SQLite claim storage', () => {
    let dir: string;
    beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'dg-claims-')); });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));
    it('saves and reconstructs linked domain records as one transaction', () => {
        withSessionWrite(dir, db => {
            db.prepare('INSERT INTO results (id, data) VALUES (?, ?)').run('r1', '{}');
            writeRecords(db, 'claims', [{ id: 'c1', text: 'claim' }]);
            writeRecords(db, 'evidences', [{ id: 'e1', claimId: 'c1', resultId: 'r1', quote: 'body' }]);
            writeRecords(db, 'verdicts', [{ id: 'v1', claimId: 'c1', evidenceIds: ['e1'], stance: 'support' }]);
            writeRecords(db, 'reviews', [{ claimId: 'c1', decision: 'approved' }]);
        });
        expect(withSessionRead(dir, db => readRecords(db, 'verdicts'))).toEqual([{ id: 'v1', claimId: 'c1', evidenceIds: ['e1'], stance: 'support' }]);
        expect(withSessionRead(dir, db => readRecords(db, 'reviews'))).toEqual([{ claimId: 'c1', decision: 'approved' }]);
        withSessionWrite(dir, db => writeRecords(db, 'reviews', []));
        expect(withSessionRead(dir, db => readRecords(db, 'reviews'))).toEqual([]);
    });

    it('rejects a record with no identifier rather than fabricating one', () => {
        expect(() => withSessionWrite(dir, db => writeRecords(db, 'claims', [{ text: 'missing id' }]))).toThrow('Invalid session record identifier');
        expect(withSessionRead(dir, db => readRecords(db, 'claims'))).toEqual([]);
    });
});
