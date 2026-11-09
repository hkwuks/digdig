/**
 * Claims store — CRUD operations for claims/*.json files.
 *
 * Each session directory has a claims/ subdirectory with four files
 * using the same envelope format as results.json/graph.json:
 *   { "status": "ok", "data": { "claims": [...] } }
 */

import { readFileSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  Claim,
  EvidenceSpan,
  Verdict,
  Review,
  ReviewStatus,
} from './types.js';

// ── Path helpers ────────────────────────────────────────────────────

function claimsDir(sessionDir: string): string {
  return join(sessionDir, 'claims');
}

function claimsFile(sessionDir: string): string {
  return join(claimsDir(sessionDir), 'claims.json');
}

function evidencesFile(sessionDir: string): string {
  return join(claimsDir(sessionDir), 'evidences.json');
}

function verdictsFile(sessionDir: string): string {
  return join(claimsDir(sessionDir), 'verdicts.json');
}

function reviewsFile(sessionDir: string): string {
  return join(claimsDir(sessionDir), 'reviews.json');
}

function ensureClaimsDir(sessionDir: string): void {
  const dir = claimsDir(sessionDir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ── Generic loader / writer ─────────────────────────────────────────

interface Envelope<T> {
  status: 'ok';
  data: { items: T[] };
}

export class ClaimsStateError extends Error {
  constructor(readonly file: string, detail?: string) {
    super(`Cannot read claims state: ${file}${detail ? `: ${detail}` : ''}`);
  }
}

function loadArray<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Envelope<T>;
    if (parsed.status === 'ok' && Array.isArray(parsed.data?.items)) {
      return parsed.data.items;
    }
    throw new Error('invalid claims envelope');
  } catch {
    throw new ClaimsStateError(file);
  }
}

/** Validate all existing claim artifacts before any related mutation. */
export function assertClaimsStoreReadable(sessionDir: string): void {
  loadClaims(sessionDir);
  loadArray<EvidenceSpan>(evidencesFile(sessionDir));
  loadArray<Verdict>(verdictsFile(sessionDir));
  loadArray<Review>(reviewsFile(sessionDir));
}

function writeArray<T>(file: string, items: T[]): void {
  const dir = dirname(file);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const temp = join(dir, `.${file.split(/[\\/]/).pop()}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(temp, JSON.stringify({ status: 'ok', data: { items } } as Envelope<T>, null, 2), 'utf-8');
  try { renameSync(temp, file); }
  catch (error) { try { rmSync(temp, { force: true }); } catch { /* preserve write error */ } throw error; }
}

// ── Claims ──────────────────────────────────────────────────────────

export function loadClaims(sessionDir: string): Claim[] {
  const file = claimsFile(sessionDir);
  const claims = loadArray<Claim>(file);
  const invalid = claims.findIndex(claim => !claim || !['low', 'medium', 'high'].includes(claim.riskLevel));
  if (invalid !== -1) throw new ClaimsStateError(file, `Invalid riskLevel at claim index ${invalid}; expected low, medium, or high`);
  return claims;
}

export function saveClaims(sessionDir: string, claims: Claim[]): void {
  ensureClaimsDir(sessionDir);
  writeArray(claimsFile(sessionDir), claims);
}

/** Allocate next claim ID: cl_<seq>. Reads current count from file. */
export function nextClaimId(sessionDir: string): string {
  const claims = loadClaims(sessionDir);
  const seq = claims.length + 1;
  return `cl_${String(seq).padStart(3, '0')}`;
}

// ── EvidenceSpans ────────────────────────────────────────────────────

export function loadEvidences(sessionDir: string): EvidenceSpan[] {
  return loadArray<EvidenceSpan>(evidencesFile(sessionDir));
}

export function saveEvidences(sessionDir: string, evidences: EvidenceSpan[]): void {
  ensureClaimsDir(sessionDir);
  writeArray(evidencesFile(sessionDir), evidences);
}

/** Allocate next evidence ID: ev_<seq>. */
export function nextEvidenceId(sessionDir: string): string {
  const evs = loadEvidences(sessionDir);
  const seq = evs.length + 1;
  return `ev_${String(seq).padStart(3, '0')}`;
}

// ── Verdicts ────────────────────────────────────────────────────────

export function loadVerdicts(sessionDir: string): Verdict[] {
  return loadArray<Verdict>(verdictsFile(sessionDir));
}

export function saveVerdicts(sessionDir: string, verdicts: Verdict[]): void {
  ensureClaimsDir(sessionDir);
  writeArray(verdictsFile(sessionDir), verdicts);
}

/** Allocate next verdict ID: vd_<seq>. */
export function nextVerdictId(sessionDir: string): string {
  const vds = loadVerdicts(sessionDir);
  const seq = vds.length + 1;
  return `vd_${String(seq).padStart(3, '0')}`;
}

// ── Reviews ─────────────────────────────────────────────────────────

export function loadReviews(sessionDir: string): Review[] {
  return loadArray<Review>(reviewsFile(sessionDir));
}

export function saveReviews(sessionDir: string, reviews: Review[]): void {
  ensureClaimsDir(sessionDir);
  writeArray(reviewsFile(sessionDir), reviews);
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Get claims filtered by status */
export function getClaimsByStatus(
  sessionDir: string,
  status?: Claim['status']
): Claim[] {
  const all = loadClaims(sessionDir);
  if (!status) return all;
  return all.filter(c => c.status === status);
}

/** Get reviews filtered by decision */
export function getReviewsByDecision(
  sessionDir: string,
  decision?: ReviewStatus
): Review[] {
  const all = loadReviews(sessionDir);
  if (!decision) return all;
  return all.filter(r => r.decision === decision);
}

/** Get evidence for a specific claim */
export function getEvidenceForClaim(
  sessionDir: string,
  claimId: string
): EvidenceSpan[] {
  return loadEvidences(sessionDir).filter(e => e.claimId === claimId);
}

/** Get verdicts for a specific claim */
export function getVerdictsForClaim(
  sessionDir: string,
  claimId: string
): Verdict[] {
  return loadVerdicts(sessionDir).filter(v => v.claimId === claimId);
}
