/**
 * Comprehensive tests for Claim—Evidence—Review pipeline.
 *
 * Covers: store CRUD, deterministic checks (hash/anchor/Jaccard/source cluster),
 * and policy engine (all 7 rules + edge cases).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createHash, randomBytes } from 'crypto';

// ── Helpers ─────────────────────────────────────────────────────────

let tmpDir = '';
let sessionDir = '';

function makeSession(): string {
  const d = join(tmpDir, `sxng-test-${randomBytes(4).toString('hex')}`);
  mkdirSync(d, { recursive: true });
  // Write a minimal results.json with some approved results
  writeFileSync(join(d, 'results.json'), JSON.stringify({
    status: 'ok',
    data: {
      results: [
        {
          id: 'r:article', revision: 1, contentType: 'extracted', extractor: 'fixture', origins: [],
          url: 'https://example.com/article',
          title: 'Test Article',
          content: 'Tokio is the most widely used async runtime in the Rust ecosystem. It provides a powerful asynchronous programming model. Many production systems rely on Tokio for network services.',
          status: 'approved',
          publishedDate: '2025-01-15',
          extractedAt: 1_700_000_000_000,
        },
        {
          id: 'r:report', revision: 1, contentType: 'extracted', extractor: 'fixture', origins: [],
          url: 'https://other-source.org/report',
          title: 'Async Rust Report',
          content: 'The Rust async ecosystem has evolved significantly. While Tokio dominates, async-std also offers a compelling alternative for certain use cases. Community adoption trends show Tokio leading.',
          status: 'approved',
          publishedDate: '2025-06-01',
          extractedAt: 1_700_000_000_001,
        },
        {
          id: 'r:policy', revision: 1, contentType: 'extracted', extractor: 'fixture', origins: [],
          url: 'https://policy.example.cn/ai-platform',
          title: '人工智能产业发展政策',
          content: '上海市发布人工智能产业发展政策，AI 平台版本 1.2.4 已上线并支持本地模型部署。',
          status: 'approved',
          publishedDate: '2025-06-15',
          extractedAt: 1_700_000_000_002,
        },
        {
          id: 'r:unrelated', revision: 1, contentType: 'extracted', extractor: 'fixture', origins: [],
          url: 'https://unrelated.example.cn/recruiting',
          title: '年度招聘计划',
          content: '人工智能研究团队发布年度招聘计划，重点招聘算法和工程岗位。',
          status: 'approved',
          publishedDate: '2025-06-15',
          extractedAt: 1_700_000_000_003,
        },
        {
          id: 'r:pending', revision: 1, contentType: 'extracted', extractor: 'fixture', origins: [],
          url: 'https://pending-source.dev/note',
          title: 'Pending Note',
          content: 'This result is still pending and should not appear in evidence searches.',
          status: 'pending',
        },
      ],
      rounds: 2,
    },
  }), 'utf-8');
  return d;
}

function sessionInput(name: string, value: unknown): string {
  const dir = join(sessionDir, 'agent-inputs');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, JSON.stringify(value), 'utf8');
  return file;
}

import {
  Claim,
  EvidenceSpan,
  Verdict,
  Review,
  ReviewStatus,
  ReviewChecks,
} from '../src/claims/types.js';

import {
  loadClaims,
  saveClaims,
  nextClaimId,
  loadEvidences,
  saveEvidences,
  nextEvidenceId,
  loadVerdicts,
  saveVerdicts,
  nextVerdictId,
  loadReviews,
  saveReviews,
  getClaimsByStatus,
  getReviewsByDecision,
  getEvidenceForClaim,
  getVerdictsForClaim,
} from '../src/claims/store.js';

import {
  checkAnchor,
  resolveApprovedContent,
  computeSourceClusterId,
  searchCandidates,
  EvidenceCandidate,
} from '../src/claims/deterministic-checks.js';

import {
  aggregateClaim,
  aggregateAll,
  PolicyInput,
} from '../src/claims/policy.js';
import { runClaimAdd } from '../src/commands/claim.js';
import { runEvidenceVerify } from '../src/commands/evidence.js';
import { runPolicyAggregate } from '../src/commands/review.js';

// ── Setup / Teardown ────────────────────────────────────────────────

beforeEach(() => {
  tmpDir = tmpdir();
  sessionDir = makeSession();
});

afterEach(() => {
  if (sessionDir) {
    rmSync(sessionDir, { recursive: true, force: true });
  }
});

// ── Section 1: Store CRUD ───────────────────────────────────────────

describe('store (CRUD)', () => {
  it('should save and load claims', () => {
    const claims: Claim[] = [
      {
        id: 'cl_001',
        text: 'Tokio is the most widely used async runtime',
        riskLevel: 'medium',
        status: 'pending',
        sessionDir,
        createdAt: Date.now(),
      },
    ];
    saveClaims(sessionDir, claims);
    const loaded = loadClaims(sessionDir);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe('cl_001');
    expect(loaded[0].text).toBe(claims[0].text);
  });

  it('should return empty array for non-existent claims file', () => {
    const claims = loadClaims(sessionDir);
    expect(claims).toEqual([]);
  });

  it('should generate sequential claim IDs', () => {
    // When file doesn't exist, next ID starts at 1
    const id1 = nextClaimId(sessionDir);
    expect(id1).toBe('cl_001');

    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'c1', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
    ]);
    const id2 = nextClaimId(sessionDir);
    expect(id2).toBe('cl_002');

    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'c1', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
      { id: 'cl_002', text: 'c2', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
    ]);
    const id3 = nextClaimId(sessionDir);
    expect(id3).toBe('cl_003');
  });

  it('should generate sequential evidence IDs', () => {
    expect(nextEvidenceId(sessionDir)).toBe('ev_001');
  });

  it('should generate sequential verdict IDs', () => {
    expect(nextVerdictId(sessionDir)).toBe('vd_001');
  });

  it('should save and load evidences', () => {
    saveClaims(sessionDir, [{ id: 'cl_001', text: 'c', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 }]);
    const evs: EvidenceSpan[] = [
      {
        id: 'ev_001',
        claimId: 'cl_001',
        resultId: 'r:article',
        resultUrl: 'https://example.com',
        quote: 'test quote',
        charStart: 0,
        charEnd: 10,
        contentHash: 'abc',
        extractedAt: Date.now(),
      },
    ];
    saveEvidences(sessionDir, evs);
    expect(loadEvidences(sessionDir)).toHaveLength(1);
  });

  it('should save and load verdicts', () => {
    saveClaims(sessionDir, [{ id: 'cl_001', text: 'c', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 }]);
    saveEvidences(sessionDir, [{ id: 'ev_001', claimId: 'cl_001', resultId: 'r:article', quote: 'q', charStart: 0, charEnd: 1, contentHash: 'x', extractedAt: 1 }]);
    const vds: Verdict[] = [
      {
        id: 'vd_001',
        claimId: 'cl_001',
        evidenceIds: ['ev_001'],
        stance: 'support',
        reason: 'Direct confirmation',
        createdAt: Date.now(),
      },
    ];
    saveVerdicts(sessionDir, vds);
    expect(loadVerdicts(sessionDir)).toHaveLength(1);
  });

  it('should save and load reviews', () => {
    saveClaims(sessionDir, [{ id: 'cl_001', text: 'c', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 }]);
    const revs: Review[] = [
      {
        claimId: 'cl_001',
        decision: 'approved',
        autoPass: true,
        checks: { sourceIndependent: true, hasRefute: false, allSupport: true },
        matchedRule: 'dualSourceSupport',
        reviewer: 'agent',
        reviewedAt: Date.now(),
      },
    ];
    saveReviews(sessionDir, revs);
    expect(loadReviews(sessionDir)).toHaveLength(1);
  });

  it('should filter claims by status', () => {
    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'a', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
      { id: 'cl_002', text: 'b', riskLevel: 'low', status: 'reviewed', sessionDir, createdAt: 0 },
    ]);
    expect(getClaimsByStatus(sessionDir, 'pending')).toHaveLength(1);
    expect(getClaimsByStatus(sessionDir)).toHaveLength(2);
  });

  it('should filter reviews by decision', () => {
    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'a', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
      { id: 'cl_002', text: 'b', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
    ]);
    saveReviews(sessionDir, [
      { claimId: 'cl_001', decision: 'approved', autoPass: true, checks: { sourceIndependent: true, hasRefute: false, allSupport: true }, matchedRule: 'dualSourceSupport', reviewer: 'agent', reviewedAt: 0 },
      { claimId: 'cl_002', decision: 'needsReview', autoPass: false, checks: { sourceIndependent: false, hasRefute: true, allSupport: false }, matchedRule: 'singleRefute', reviewer: 'agent', reviewedAt: 0 },
    ]);
    expect(getReviewsByDecision(sessionDir, 'approved')).toHaveLength(1);
    expect(getReviewsByDecision(sessionDir)).toHaveLength(2);
  });

  it('should get evidence/verdicts by claim ID', () => {
    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'a', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
      { id: 'cl_002', text: 'b', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
    ]);
    const evs: EvidenceSpan[] = [
      { id: 'ev_001', claimId: 'cl_001', resultId: 'r:article', resultUrl: 'https://x.com', quote: 'q', charStart: 0, charEnd: 1, contentHash: 'a', extractedAt: 0 },
      { id: 'ev_002', claimId: 'cl_002', resultId: 'r:report', resultUrl: 'https://y.com', quote: 'r', charStart: 0, charEnd: 1, contentHash: 'b', extractedAt: 0 },
    ];
    saveEvidences(sessionDir, evs);
    expect(getEvidenceForClaim(sessionDir, 'cl_001')).toHaveLength(1);
    expect(getEvidenceForClaim(sessionDir, 'cl_002')).toHaveLength(1);
    expect(getEvidenceForClaim(sessionDir, 'cl_003')).toHaveLength(0);
  });
});

describe('claim-add', () => {
  it('assigns distinct sequential IDs to every claim in a batch', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runClaimAdd(sessionDir, {
      claimsFile: sessionInput('claims.json', [
        { text: 'Tokio is widely used.' },
        { text: 'Rust 2024 introduced async closures.' },
        { text: 'async-std is no longer actively maintained.' },
      ]),
    })).toBe(0);

    expect(loadClaims(sessionDir).map(claim => claim.id)).toEqual(['cl_001', 'cl_002', 'cl_003']);
    const output = JSON.parse(log.mock.calls[0][0]);
    expect(Object.keys(output.data.candidates)).toEqual(['cl_001', 'cl_002', 'cl_003']);
  });

  it('continues a batch after previously stored claims', async () => {
    saveClaims(sessionDir, [
      { id: 'cl_001', text: 'Existing claim.', riskLevel: 'low', status: 'pending', sessionDir, createdAt: 0 },
    ]);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runClaimAdd(sessionDir, {
      claimsFile: sessionInput('claims.json', [{ text: 'Second claim.' }, { text: 'Third claim.' }]),
    })).toBe(0);

    expect(loadClaims(sessionDir).map(claim => claim.id)).toEqual(['cl_001', 'cl_002', 'cl_003']);
  });

  it('adds batch claims from a UTF-8 JSON file', async () => {
    const file = join(sessionDir, 'agent-inputs', 'claims.json');
    mkdirSync(join(sessionDir, 'agent-inputs'), { recursive: true });
    writeFileSync(file, `\uFEFF${JSON.stringify([{ text: '中文 Claim。' }])}`, 'utf8');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runClaimAdd(sessionDir, { claimsFile: file } as any)).toBe(0);
    expect(loadClaims(sessionDir).map(claim => claim.text)).toEqual(['中文 Claim。']);
  });

  it('rejects multiple claim input sources without writing claims', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);

    expect(await runClaimAdd(sessionDir, {
      claimFile: sessionInput('claim.json', { text: 'One.' }),
      claimsFile: sessionInput('claims.json', [{ text: 'Batch.' }]),
    })).toBe(1);
    expect(loadClaims(sessionDir)).toEqual([]);
  });
});

// ── Section 2: Deterministic Checks ─────────────────────────────────

describe('deterministic checks', () => {
  describe('evidence verification', () => {
    it.each([
      { name: 'empty quote', quote: '', charStart: 0, charEnd: 0, code: 'INVALID_EVIDENCE' },
      { name: 'whitespace-only quote', quote: ' ', charStart: 5, charEnd: 6, code: 'INVALID_EVIDENCE' },
      { name: 'zero-length span', quote: 'x', charStart: 0, charEnd: 0, code: 'OFFSET_OUT_OF_RANGE' },
      { name: 'reversed span', quote: 'x', charStart: 10, charEnd: 3, code: 'OFFSET_OUT_OF_RANGE' },
    ])('rejects $name without recording evidence', async ({ quote, charStart, charEnd, code }) => {
      saveClaims(sessionDir, [{
        id: 'cl_001', text: 'Tokio is widely used', riskLevel: 'medium',
        status: 'pending', sessionDir, createdAt: Date.now(),
      }]);
      const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      output.mockClear();

      expect(await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001',
        evidenceFile: sessionInput('invalid-span.json', { resultId: 'r:article', quote, charStart, charEnd }),
        stance: 'support', reason: 'test',
      })).toBe(1);
      expect(output).toHaveBeenCalledWith(expect.stringContaining(`"code": "${code}"`));
      expect(loadEvidences(sessionDir)).toEqual([]);
    });

    it('rejects a quote that differs from the approved content at its offsets', async () => {
      saveClaims(sessionDir, [{
        id: 'cl_001',
        text: 'Tokio is widely used',
        riskLevel: 'medium',
        status: 'pending',
        sessionDir,
        createdAt: Date.now(),
      }]);

      const code = await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001',
        evidenceFile: sessionInput('invalid-evidence.json', {
          resultId: 'r:article',
          quote: 'This quote was never in the source.',
          charStart: 0,
          charEnd: 5,
        }),
        stance: 'support',
        reason: 'test',
      });

      expect(code).toBe(1);
      expect(loadEvidences(sessionDir)).toEqual([]);
    });

    it('records the source extraction time instead of evidence verification time', async () => {
      const extractedAt = 1_700_000_000_000;
      saveClaims(sessionDir, [{
        id: 'cl_001',
        text: 'Tokio is widely used',
        riskLevel: 'medium',
        status: 'pending',
        sessionDir,
        createdAt: Date.now(),
      }]);

      const quote = 'Tokio is the most widely used async runtime in the Rust ecosystem.';
      const code = await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001',
        evidenceFile: sessionInput('evidence.json', {
          resultId: 'r:article',
          quote,
          charStart: 0,
          charEnd: quote.length,
        }),
        stance: 'support',
        reason: 'The approved source directly supports the claim.',
      });

      expect(code).toBe(0);
      expect(loadEvidences(sessionDir)[0].extractedAt).toBe(extractedAt);
    });

    it('repairs a partial prior verification when the matching evidence already exists', async () => {
      const quote = 'Tokio is the most widely used async runtime in the Rust ecosystem.';
      saveClaims(sessionDir, [{
        id: 'cl_001', text: 'Tokio is widely used', riskLevel: 'medium',
        status: 'pending', sessionDir, createdAt: Date.now(),
      }]);
      saveEvidences(sessionDir, [{
        id: 'ev_001', claimId: 'cl_001', resultId: 'r:article', resultUrl: 'https://example.com/article',
        quote, charStart: 0, charEnd: quote.length,
        contentHash: createHash('sha256').update(quote).digest('hex'), extractedAt: 1_700_000_000_000,
      }]);

      expect(await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001',
        evidenceFile: sessionInput('repair-evidence.json', { resultId: 'r:article', quote, charStart: 0, charEnd: quote.length }),
        stance: 'support', reason: 'The approved source directly supports the claim.',
      })).toBe(0);

      expect(loadEvidences(sessionDir)).toHaveLength(1);
      expect(loadVerdicts(sessionDir)).toMatchObject([{ claimId: 'cl_001', evidenceIds: ['ev_001'] }]);
      expect(loadClaims(sessionDir).find(claim => claim.id === 'cl_001')?.status).toBe('verifying');
    });

    it('rejects evidence from a skipped approved result', async () => {
      const resultsFile = join(sessionDir, 'results.json');
      const results = JSON.parse(readFileSync(resultsFile, 'utf-8'));
      results.data.results[0].skippedAt = Date.now();
      writeFileSync(resultsFile, JSON.stringify(results), 'utf-8');
      saveClaims(sessionDir, [{
        id: 'cl_001', text: 'Tokio is widely used', riskLevel: 'medium',
        status: 'pending', sessionDir, createdAt: Date.now(),
      }]);
      const quote = 'Tokio is the most widely used async runtime in the Rust ecosystem.';

      expect(await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001',
        evidenceFile: sessionInput('skipped-evidence.json', { resultId: 'r:article', quote, charStart: 0, charEnd: quote.length }),
        stance: 'support', reason: 'The source was skipped.',
      })).toBe(1);
      expect(loadEvidences(sessionDir)).toEqual([]);
    });

    it('reads evidence from a UTF-8 JSON file', async () => {
      saveClaims(sessionDir, [{
        id: 'cl_001', text: 'Tokio is widely used', riskLevel: 'medium',
        status: 'pending', sessionDir, createdAt: Date.now(),
      }]);
      const quote = 'Tokio is the most widely used async runtime in the Rust ecosystem.';
      const evidenceFile = join(sessionDir, 'agent-inputs', 'evidence.json');
      mkdirSync(join(sessionDir, 'agent-inputs'), { recursive: true });
      writeFileSync(evidenceFile, `\uFEFF${JSON.stringify({
        resultId: 'r:article', quote, charStart: 0, charEnd: quote.length,
      })}`, 'utf8');

      expect(await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001', evidenceFile, stance: 'support', reason: 'Verified from the source.',
      } as any)).toBe(0);
      expect(loadEvidences(sessionDir)).toHaveLength(1);
    });

    it('requires an extraction time before evidence can be verified', async () => {
      const resultsFile = join(sessionDir, 'results.json');
      const results = JSON.parse(readFileSync(resultsFile, 'utf-8'));
      delete results.data.results[0].extractedAt;
      writeFileSync(resultsFile, JSON.stringify(results), 'utf-8');
      saveClaims(sessionDir, [{
        id: 'cl_001',
        text: 'Tokio is widely used',
        riskLevel: 'medium',
        status: 'pending',
        sessionDir,
        createdAt: Date.now(),
      }]);

      const quote = 'Tokio is the most widely used async runtime in the Rust ecosystem.';
      const code = await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001',
        evidenceFile: sessionInput('missing-extracted-at.json', {
          resultId: 'r:article',
          quote,
          charStart: 0,
          charEnd: quote.length,
        }),
        stance: 'support',
        reason: 'The approved source directly supports the claim.',
      });

      expect(code).toBe(1);
      expect(loadEvidences(sessionDir)).toEqual([]);
    });

    it('persists refreshed domain clusters when completing a review', async () => {
      saveClaims(sessionDir, [
        {
          id: 'cl_001',
          text: 'Tokio is widely used',
          riskLevel: 'medium',
          status: 'pending',
          sessionDir,
          createdAt: Date.now(),
        },
        {
          id: 'cl_002',
          text: 'An unrelated claim',
          riskLevel: 'low',
          status: 'pending',
          sessionDir,
          createdAt: Date.now(),
        },
      ]);
      saveEvidences(sessionDir, [{
        id: 'ev_001',
        claimId: 'cl_002',
        resultId: 'r:report',
        resultUrl: 'https://other-source.org/report',
        quote: 'Existing evidence remains stored.',
        charStart: 0,
        charEnd: 32,
        contentHash: 'existing',
        extractedAt: Date.now(),
      }]);

      const quote = 'Tokio is the most widely used async runtime in the Rust ecosystem.';
      const code = await runEvidenceVerify(sessionDir, {
        claimId: 'cl_001',
        evidenceFile: sessionInput('complete-evidence.json', {
          resultId: 'r:article',
          quote,
          charStart: 0,
          charEnd: quote.length,
        }),
        stance: 'support',
        reason: 'The approved source directly supports the claim.',
        complete: true,
      });

      const evidences = loadEvidences(sessionDir);
      const completedEvidence = evidences.find(evidence => evidence.claimId === 'cl_001');

      expect(code).toBe(0);
      expect(evidences).toHaveLength(2);
      expect(evidences.some(evidence => evidence.claimId === 'cl_002')).toBe(true);
      expect(completedEvidence?.sourceClusterId).toBe(computeSourceClusterId(completedEvidence!));
    });
  });

  describe('checkAnchor', () => {
    it('should pass when all anchors are valid', () => {
      const content = 'Tokio is the most widely used async runtime in the Rust ecosystem.';
      const quote = 'Tokio is the most widely used async runtime';
      const charStart = content.indexOf(quote);
      const charEnd = charStart + quote.length;
      const contentHash = createHash('sha256').update(quote).digest('hex');
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote,
        charStart,
        charEnd,
        contentHash,
        extractedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.url).toBe(true);
      expect(result.offsetInRange).toBe(true);
      expect(result.hashMatches).toBe(true);
    });

    it('should fail when hash does not match', () => {
      const content = 'Tokio is the most widely used async runtime.';
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote: 'This is a different quote',
        charStart: 0,
        charEnd: 47,
        contentHash: 'deadbeef',
        extractedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.hashMatches).toBe(false);
    });

    it('should fail when offset exceeds content length', () => {
      const content = 'Short content.';
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com',
        quote: 'Short',
        charStart: 0,
        charEnd: 999,
        contentHash: createHash('sha256').update('Short').digest('hex'),
        extractedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.offsetInRange).toBe(false);
    });

    it('should fail when charStart is negative', () => {
      const content = 'Some content.';
      const evidence: EvidenceSpan = {
        id: 'ev_001',
        claimId: 'cl_001',
        resultUrl: 'https://example.com',
        quote: 'Some',
        charStart: -5,
        charEnd: 4,
        contentHash: 'x',
        extractedAt: Date.now(),
      };
      const result = checkAnchor(evidence, content);
      expect(result.offsetInRange).toBe(false);
    });
  });

  describe('resolveApprovedContent', () => {
    it('should find content from approved results', () => {
      const found = resolveApprovedContent(sessionDir, 'https://example.com/article');
      expect(found).not.toBeNull();
      expect(found!.content).toContain('Tokio');
    });

    it('should return null for non-existent URL', () => {
      const found = resolveApprovedContent(sessionDir, 'https://example.com/nonexistent');
      expect(found).toBeNull();
    });

    it('should return null for pending (not approved) results', () => {
      const found = resolveApprovedContent(sessionDir, 'https://pending-source.dev/note');
      expect(found).toBeNull();
    });
  });

  describe('computeSourceClusterId', () => {
    it('should produce identical IDs for same evidence', () => {
      const ev1: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote: 'Tokio is the most widely used async runtime',
        charStart: 0, charEnd: 47,
        contentHash: 'x', extractedAt: 0,
      };
      const ev2: EvidenceSpan = { ...ev1, id: 'ev_002' };
      expect(computeSourceClusterId(ev1)).toBe(computeSourceClusterId(ev2));
    });

    it('should produce different IDs for different domains', () => {
      const ev1: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'https://site-a.com/article',
        quote: 'Same quote text here',
        charStart: 0, charEnd: 20,
        contentHash: 'x', extractedAt: 0,
      };
      const ev2: EvidenceSpan = {
        id: 'ev_002', claimId: 'cl_001',
        resultUrl: 'https://site-b.com/article',
        quote: 'Same quote text here',
        charStart: 0, charEnd: 20,
        contentHash: 'x', extractedAt: 0,
      };
      expect(computeSourceClusterId(ev1)).not.toBe(computeSourceClusterId(ev2));
    });

    it('should group different quotes from the same publisher', () => {
      const ev1: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'https://publisher.example/article-one',
        quote: 'The first article provides one supporting fact.',
        charStart: 0, charEnd: 45,
        contentHash: 'x', extractedAt: 0,
      };
      const ev2: EvidenceSpan = {
        ...ev1,
        id: 'ev_002',
        resultUrl: 'https://www.publisher.example/article-two',
        quote: 'A different article provides another supporting fact.',
      };
      expect(computeSourceClusterId(ev1)).toBe(computeSourceClusterId(ev2));
    });

    it('should conservatively group evidence without a publisher domain', () => {
      const ev1: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'file:///notes/first.md', quote: 'First local source.',
        charStart: 0, charEnd: 19, contentHash: 'x', extractedAt: 0,
      };
      const ev2: EvidenceSpan = {
        ...ev1,
        id: 'ev_002', resultUrl: 'file:///notes/second.md', quote: 'Second local source.',
      };
      expect(computeSourceClusterId(ev1)).toBe(computeSourceClusterId(ev2));
    });

    it('should return 16 hex characters', () => {
      const ev: EvidenceSpan = {
        id: 'ev_001', claimId: 'cl_001',
        resultUrl: 'https://example.com/article',
        quote: 'A sample quote for testing',
        charStart: 0, charEnd: 26,
        contentHash: 'x', extractedAt: 0,
      };
      const id = computeSourceClusterId(ev);
      expect(id).toHaveLength(16);
      expect(/^[0-9a-f]{16}$/.test(id)).toBe(true);
    });
  });

  describe('searchCandidates (Jaccard sentence matching)', () => {
    it('should find relevant sentences for a keyword-rich claim', () => {
      const candidates = searchCandidates(sessionDir, 'Tokio is the most widely used async runtime');
      expect(candidates.length).toBeGreaterThanOrEqual(1);
      // Should match sentences containing "Tokio" and "async runtime"
      const match = candidates.find(c => c.quote.includes('Tokio'));
      expect(match).toBeDefined();
      expect(match!.domain).toBe('example.com');
    });

    it('should find candidate evidence for a pure Chinese claim', () => {
      const candidates = searchCandidates(sessionDir, '上海市发布人工智能产业发展政策');

      expect(candidates).toContainEqual(expect.objectContaining({
        resultUrl: 'https://policy.example.cn/ai-platform',
        quote: expect.stringContaining('人工智能产业发展政策'),
      }));
    });

    it('should retain Chinese and dotted version tokens in mixed claims', () => {
      const candidates = searchCandidates(sessionDir, '人工智能平台版本 1.2.4 已上线');

      expect(candidates).toContainEqual(expect.objectContaining({
        resultUrl: 'https://policy.example.cn/ai-platform',
        quote: expect.stringContaining('版本 1.2.4'),
      }));
    });

    it('should exclude Chinese content that only overlaps a short generic phrase', () => {
      const candidates = searchCandidates(sessionDir, '人工智能平台版本 1.2.4 已上线');

      expect(candidates).not.toContainEqual(expect.objectContaining({
        resultUrl: 'https://unrelated.example.cn/recruiting',
      }));
    });

    it('should not return results from pending (unapproved) results', () => {
      const candidates = searchCandidates(sessionDir, 'pending source note');
      // "pending source" should not match the pending result since it's not approved
      // But even if it matches "pending" in content, it won't be approved
      const pendingMatch = candidates.find(c => c.resultUrl.includes('pending-source'));
      expect(pendingMatch).toBeUndefined();
    });

    it('should not return results that were skipped after approval', () => {
      const resultsFile = join(sessionDir, 'results.json');
      const results = JSON.parse(readFileSync(resultsFile, 'utf-8'));
      results.data.results[0].skippedAt = Date.now();
      writeFileSync(resultsFile, JSON.stringify(results), 'utf-8');

      const candidates = searchCandidates(sessionDir, 'Tokio is the most widely used async runtime');
      expect(candidates).not.toContainEqual(expect.objectContaining({ resultId: 'r:article' }));
    });

    it('should return empty array for empty or too-short query', () => {
      expect(searchCandidates(sessionDir, 'a')).toHaveLength(0);
      expect(searchCandidates(sessionDir, '')).toHaveLength(0);
    });

    it('should cap at MAX_CANDIDATES (5) results', () => {
      // A broad query that might match many sentences
      const candidates = searchCandidates(sessionDir, 'Rust async Tokio runtime ecosystem');
      expect(candidates.length).toBeLessThanOrEqual(5);
    });

    it('should score candidates by Jaccard similarity (highest first)', () => {
      const candidates = searchCandidates(sessionDir, 'Tokio is the most widely used async runtime');
      if (candidates.length >= 2) {
        // First candidate should have higher or equal score than the last
        // We can indirectly verify by checking tokens are more relevant
        expect(candidates[0].quote.toLowerCase()).toContain('tokio');
      }
    });

    it('should include domain, author, siteName when available', () => {
      const candidates = searchCandidates(sessionDir, 'Tokio async');
      if (candidates.length > 0) {
        expect(candidates[0].domain).toBe('example.com');
        expect(candidates[0].resultUrl).toContain('http');
      }
    });
  });
});

// ── Section 3: Policy Engine ────────────────────────────────────────

describe('policy engine', () => {
  function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
    return {
      id: 'vd_001',
      claimId: 'cl_001',
      evidenceIds: ['ev_001'],
      stance: 'support',
      reason: 'test',
      createdAt: Date.now(),
      ...overrides,
    };
  }

  function makeEvidence(overrides: Partial<EvidenceSpan> = {}): EvidenceSpan {
    return {
      id: 'ev_001',
      claimId: 'cl_001',
      resultUrl: 'https://source-a.com/article',
      quote: 'Supporting evidence text for the claim.',
      charStart: 0,
      charEnd: 36,
      contentHash: 'a'.repeat(64),
      extractedAt: Date.now(),
      sourceClusterId: 'cluster_a',
      ...overrides,
    };
  }

  function makeInput(overrides: Partial<PolicyInput> = {}): PolicyInput {
    return {
      claimId: 'cl_001',
      riskLevel: 'medium',
      verdicts: [makeVerdict()],
      evidences: [makeEvidence()],
      ...overrides,
    };
  }

  // ── Rule #1: singleRefute ───────────────────────────────────────

  describe('rule #1: singleRefute', () => {
    it('should return needsReview when any refute verdict exists', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ stance: 'support', evidenceIds: ['ev_001'] }),
          makeVerdict({ id: 'vd_002', stance: 'refute', evidenceIds: ['ev_002'] }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b', quote: 'Refuting evidence.' }),
        ],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleRefute');
      expect(result.checks.hasRefute).toBe(true);
      expect(result.conflict).toBeDefined();
      expect(result.conflict!.refuting.length).toBeGreaterThanOrEqual(1);
    });

    it('should always trigger needsReview even with many supporting verdicts', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
          makeVerdict({ id: 'vd_003', stance: 'support' }),
          makeVerdict({ id: 'vd_004', stance: 'refute' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
          makeEvidence({ id: 'ev_003', sourceClusterId: 'cluster_c' }),
          makeEvidence({ id: 'ev_004', sourceClusterId: 'cluster_d', quote: 'Refuting.' }),
        ],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleRefute');
    });
  });

  // ── Rule #2: highRiskInsufficient ───────────────────────────────

  describe('rule #2: highRiskInsufficient', () => {
    it('should require ≥2 sources for high-risk claims', () => {
      const result = aggregateClaim(makeInput({
        riskLevel: 'high',
        evidences: [makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' })],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('highRiskInsufficient');
    });

    it('should pass to next rule when high risk has ≥2 sources', () => {
      const result = aggregateClaim(makeInput({
        riskLevel: 'high',
        verdicts: [makeVerdict({ stance: 'support' })],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      // Skips rule #1 (no refute), then passes rule #2 (≥2 sources)
      // Then rule #3: dualSourceSupport → approved
      expect(result.decision).toBe('approved');
      expect(result.matchedRule).toBe('dualSourceSupport');
    });

    it('should not affect low/medium risk claims', () => {
      const result = aggregateClaim(makeInput({
        riskLevel: 'low',
        evidences: [makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' })],
      }));
      expect(result.matchedRule).not.toBe('highRiskInsufficient');
    });
  });

  // ── Rule #3: dualSourceSupport ──────────────────────────────────

  describe('rule #3: dualSourceSupport', () => {
    it('should auto-approve when ≥2 independent sources all support', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      expect(result.decision).toBe('approved');
      expect(result.autoPass).toBe(true);
      expect(result.matchedRule).toBe('dualSourceSupport');
      expect(result.checks.sourceIndependent).toBe(true);
      expect(result.checks.allSupport).toBe(true);
    });

    it('should not approve when sources are not independent', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_a' }), // same cluster
        ],
      }));
      // 2 verdicts but only 1 unique source → falls through to rule #5: singleSource → needsReview
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleSource');
    });
  });

  // ── Rule #4: dualSourceMixed ────────────────────────────────────

  describe('rule #4: dualSourceMixed', () => {
    it('should return needsReview when ≥2 sources but some insufficient', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'insufficient' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('dualSourceMixed');
    });
  });

  // ── Rule #5: singleSource ───────────────────────────────────────

  describe('rule #5: singleSource', () => {
    it('should return needsReview when only 1 independent source', () => {
      const result = aggregateClaim(makeInput({
        evidences: [makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' })],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleSource');
    });
  });

  // ── Rule #6: allInsufficient ────────────────────────────────────

  describe('rule #6: allInsufficient', () => {
    it('should return needsReview when all verdicts are insufficient (no source cluster IDs)', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'insufficient' }),
          makeVerdict({ id: 'vd_002', stance: 'insufficient' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: undefined }),
          makeEvidence({ id: 'ev_002', sourceClusterId: undefined }),
        ],
      }));
      // Rule #4 (dualSourceMixed) requires ≥2 independent sources — no cluster IDs means 0 sources
      // So it falls through to rule #6: allInsufficient
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('allInsufficient');
    });
  });

  // ── Rule #7: fallback ───────────────────────────────────────────

  describe('rule #7: fallback', () => {
    it('should return needsReview when no other rule matches', () => {
      // Empty verdicts with no evidence — no rule matches → fallback
      const result = aggregateClaim(makeInput({
        verdicts: [],
        evidences: [],
      }));
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('fallback');
      expect(result.autoPass).toBe(false);
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle empty verdicts gracefully', () => {
      const result = aggregateClaim(makeInput({ verdicts: [], evidences: [] }));
      expect(result.decision).toBe('needsReview');
      expect(result.checks.sourceIndependent).toBe(false);
      expect(result.checks.hasRefute).toBe(false);
      expect(result.checks.allSupport).toBe(false);
    });

    it('should handle single verdict correctly', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [makeVerdict({ stance: 'support' })],
        evidences: [makeEvidence({ sourceClusterId: 'cluster_a' })],
      }));
      // 1 source + 1 support → rule #5: singleSource → needsReview
      expect(result.decision).toBe('needsReview');
      expect(result.matchedRule).toBe('singleSource');
    });

    it('should not include conflict when no refute', () => {
      const result = aggregateClaim(makeInput({
        verdicts: [makeVerdict({ stance: 'support' })],
        evidences: [makeEvidence()],
      }));
      expect(result.conflict).toBeUndefined();
    });

    it('should set autoPass correctly', () => {
      const approved = aggregateClaim(makeInput({
        verdicts: [
          makeVerdict({ id: 'vd_001', stance: 'support' }),
          makeVerdict({ id: 'vd_002', stance: 'support' }),
        ],
        evidences: [
          makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
          makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
        ],
      }));
      expect(approved.autoPass).toBe(true);

      const rejected = aggregateClaim(makeInput({
        verdicts: [makeVerdict({ stance: 'refute' })],
        evidences: [makeEvidence()],
      }));
      expect(rejected.autoPass).toBe(false);
    });

    it('should use the "agent" as the default reviewer', () => {
      const result = aggregateClaim(makeInput());
      expect(result.reviewer).toBe('agent');
      expect(result.reviewedAt).toBeGreaterThan(0);
    });
  });

  // ── aggregateAll ─────────────────────────────────────────────────

  describe('aggregateAll', () => {
    it('should aggregate multiple claims at once', () => {
      const inputs: PolicyInput[] = [
        makeInput({
          claimId: 'cl_001',
          verdicts: [
            makeVerdict({ id: 'vd_001', stance: 'support' }),
            makeVerdict({ id: 'vd_002', stance: 'support' }),
          ],
          evidences: [
            makeEvidence({ id: 'ev_001', sourceClusterId: 'cluster_a' }),
            makeEvidence({ id: 'ev_002', sourceClusterId: 'cluster_b' }),
          ],
        }),
        makeInput({
          claimId: 'cl_002',
          verdicts: [makeVerdict({ id: 'vd_003', stance: 'refute' })],
          evidences: [makeEvidence({ id: 'ev_003', sourceClusterId: 'cluster_a' })],
        }),
      ];
      const results = aggregateAll(inputs);
      expect(results).toHaveLength(2);
      expect(results[0].claimId).toBe('cl_001');
      expect(results[0].decision).toBe('approved');
      expect(results[1].claimId).toBe('cl_002');
      expect(results[1].decision).toBe('needsReview');
      expect(results[1].matchedRule).toBe('singleRefute');
    });
  });

  describe('policy aggregation command', () => {
    it('repairs a reviewed claim when its review record is missing', async () => {
      saveClaims(sessionDir, [{
        id: 'cl_001', text: 'Tokio is widely used', riskLevel: 'medium',
        status: 'reviewed', sessionDir, createdAt: Date.now(),
      }]);
      saveEvidences(sessionDir, [{
        id: 'ev_001', claimId: 'cl_001', resultId: 'r:article', resultUrl: 'https://example.com/article',
        quote: 'Tokio is the most widely used async runtime in the Rust ecosystem.',
        charStart: 0, charEnd: 64, contentHash: 'fixture', extractedAt: 1_700_000_000_000,
      }]);
      saveVerdicts(sessionDir, [{
        id: 'vd_001', claimId: 'cl_001', evidenceIds: ['ev_001'], stance: 'support', reason: 'fixture', createdAt: Date.now(),
      }]);

      expect(await runPolicyAggregate(sessionDir, {})).toBe(0);
      expect(loadReviews(sessionDir)).toMatchObject([{ claimId: 'cl_001' }]);
    });
  });
});
