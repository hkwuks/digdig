import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { runCli } from '../../src/runCli.js';
import { appendSessionResults, approveResults, initSessionDir, loadSessionResults } from '../../src/deep/session.js';
import { loadVerdicts, saveClaims } from '../../src/claims/store.js';
import { runEvidenceVerify } from '../../src/commands/evidence.js';
import { runResultsAdd } from '../../src/commands/results-add.js';

describe('input validation before session writes', () => {
    let session: string;
    let evidenceFile: string;
    let resultsFile: string;
    let initialMeta: string;
    const oldExit = process.exitCode;

    beforeEach(() => {
        session = mkdtempSync(join(tmpdir(), 'dg-validation-'));
        initSessionDir(session);
        mkdirSync(join(session, 'agent-inputs'), { recursive: true });
        evidenceFile = join(session, 'agent-inputs', 'evidence.json');
        resultsFile = join(session, 'agent-inputs', 'results.json');
        writeFileSync(evidenceFile, JSON.stringify({ resultId: 'r:a', quote: 'body', charStart: 0, charEnd: 4 }));
        writeFileSync(resultsFile, JSON.stringify([{ url: 'https://example.com', title: 'A', content: 'body', extractor: 'test' }]));
        initialMeta = readFileSync(join(session, 'meta.json'), 'utf8');
        vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 10000);
        vi.spyOn(console, 'log').mockImplementation(() => undefined);
        process.exitCode = 0;
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.exitCode = oldExit;
        rmSync(session, { recursive: true, force: true });
    });

    it.each([
        ['--stance', 'bogus'], ['--confidence', 'abc'], ['--confidence', '0.5garbage'],
        ['--confidence', '-0.1'], ['--confidence', '1.1'], ['--confidence', 'Infinity'],
    ])('rejects evidence option %s %s without changing metadata', async (option, value) => {
        const args = ['evidence-verify', session, '--claim-id', 'cl_001', '--evidence-file', evidenceFile, '--stance', 'support', '--reason', 'test'];
        if (option === '--stance') args[args.indexOf('support')] = value;
        else args.push(option, value);
        await runCli(args, {} as never);
        expect(process.exitCode).toBe(1);
        expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: expect.stringMatching(/^INVALID_/) } });
        expect(readFileSync(join(session, 'meta.json'), 'utf8')).toBe(initialMeta);
    });

    it('rejects a non-string contentHash without changing metadata', async () => {
        writeFileSync(evidenceFile, JSON.stringify({ resultId: 'r:a', quote: 'body', charStart: 0, charEnd: 4, contentHash: 42 }));
        await runCli(['evidence-verify', session, '--claim-id', 'cl_001', '--evidence-file', evidenceFile, '--stance', 'support', '--reason', 'test'], {} as never);
        expect(process.exitCode).toBe(1);
        expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'INVALID_EVIDENCE' } });
        expect(readFileSync(join(session, 'meta.json'), 'utf8')).toBe(initialMeta);
    });

    it('rejects an invalid result kind without importing it or changing metadata', async () => {
        await runCli(['results-add', session, '--kind', 'bogus', '--data-file', resultsFile, '--tool', 'test', '--query', 'q'], {} as never);
        expect(process.exitCode).toBe(1);
        expect(JSON.parse(vi.mocked(console.log).mock.lastCall![0])).toMatchObject({ status: 'error', error: { code: 'INVALID_RESULTS' } });
        expect(readFileSync(join(session, 'meta.json'), 'utf8')).toBe(initialMeta);
    });

    it('also validates direct command calls', async () => {
        expect(await runEvidenceVerify(session, { claimId: 'c', stance: 'bogus' as never, reason: 'test' })).toBe(1);
        expect(await runResultsAdd({ session, kind: 'bogus' as never, dataFile: resultsFile })).toBe(1);
        expect(readFileSync(join(session, 'meta.json'), 'utf8')).toBe(initialMeta);
    });

    it.each([0, 1])('accepts confidence boundary %s and persists it', async confidence => {
        appendSessionResults(session, [{ url: 'https://example.com', title: 'A', content: 'body', contentType: 'extracted', extractor: 'test', extractedAt: 1, origins: [] }]);
        const result = loadSessionResults(session)[0];
        approveResults(session, [{ id: result.id, revision: result.revision }]);
        saveClaims(session, [{ id: 'cl_001', text: 'Example', riskLevel: 'low', status: 'pending', sessionDir: session, createdAt: 1 }]);
        writeFileSync(evidenceFile, JSON.stringify({ resultId: result.id, quote: 'body', charStart: 0, charEnd: 4 }));
        await runCli(['evidence-verify', session, '--claim-id', 'cl_001', '--evidence-file', evidenceFile, '--stance', 'support', '--reason', 'test', '--confidence', String(confidence)], {} as never);
        expect(process.exitCode).toBe(0);
        expect(loadVerdicts(session)[0].confidence).toBe(confidence);
    });
});
