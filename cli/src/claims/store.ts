/**
 * Claims store — CRUD operations within the session database.
 */

import { basename, dirname, join } from 'path';
import { withSessionRead, withSessionWrite } from '../deep/session-store.js';
import { readRecords, writeRecords, type ClaimTable } from '../deep/session-store-claims.js';
import { SessionStateError } from '../deep/session-lock.js';
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

// ── Generic loader / writer ─────────────────────────────────────────

export class ClaimsStateError extends Error {
  constructor(readonly file: string, detail?: string) {
    super(`Cannot read claims state: ${file}${detail ? `: ${detail}` : ''}`);
  }
}

function loadArray<T>(file: string): T[] {
  try {
    const table = basename(file, '.json') as ClaimTable;
    return withSessionRead(dirname(dirname(file)), db => readRecords<T>(db, table)) ?? [];
  } catch (error) {
    if (error instanceof SessionStateError) throw error;
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
  const table = basename(file, '.json') as ClaimTable;
  withSessionWrite(dirname(dirname(file)), db => writeRecords(db, table, items as object[]));
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
