/** Evidence search, verification, and listing commands. */

import { createHash } from 'crypto';
import { EvidenceSpan, Verdict } from '../claims/types.js';
import {
  assertClaimsStoreReadable,
  ClaimsStateError,
  loadClaims,
  loadEvidences,
  loadReviews,
  loadVerdicts,
  saveClaims,
  saveEvidences,
  saveReviews,
  saveVerdicts,
} from '../claims/store.js';
import { aggregateClaim } from '../claims/policy.js';
import { computeSourceClusterId, searchCandidates } from '../claims/deterministic-checks.js';
import { getApprovedResults, initSessionDir, mutateSessionState, resolveSessionPath } from '../deep/session.js';
import { createErrorEnvelope, createSuccessEnvelope } from '../protocol.js';
import { isJsonObject, readSessionJsonInput } from './json-input.js';

interface EvidenceInput {
  resultId: string;
  quote: string;
  charStart: number;
  charEnd: number;
  contentHash?: string;
}

class EvidenceCommandError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export async function runEvidenceSearch(
  session: string,
  options: { claimId: string; format?: string },
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  let claim;
  try {
    assertClaimsStoreReadable(sessionDir);
    claim = loadClaims(sessionDir).find(item => item.id === options.claimId);
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify(createErrorEnvelope('CLAIMS_STATE_CORRUPTED', error.message), null, 2));
      return 1;
    }
    throw error;
  }
  if (!claim) {
    console.log(JSON.stringify(createErrorEnvelope('CLAIM_NOT_FOUND', `Claim ${options.claimId} not found`), null, 2));
    return 1;
  }

  const candidates = searchCandidates(sessionDir, claim.text);
  if ((options.format || 'json') === 'md') {
    console.log(`## Evidence Candidates for ${options.claimId}\n`);
    if (!candidates.length) console.log('No candidates found.');
    for (const [index, candidate] of candidates.entries()) {
      console.log(`**${index + 1}.** [${candidate.domain}](${candidate.resultUrl})`);
      console.log(`   ${candidate.quote.slice(0, 200)}`);
      console.log(`   offset: ${candidate.charStart}-${candidate.charEnd}\n`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ candidates }), null, 2));
  }
  return 0;
}

export async function runEvidenceVerify(
  session: string,
  options: {
    claimId: string;
    evidenceFile?: string;
    stance: 'support' | 'refute' | 'insufficient';
    reason: string;
    confidence?: number;
    complete?: boolean;
    format?: string;
  },
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  initSessionDir(sessionDir);
  const input = readSessionJsonInput(sessionDir, [{ option: '--evidence-file', value: options.evidenceFile, file: true }]);
  if (!input.ok) {
    console.log(JSON.stringify(createErrorEnvelope(input.code, input.message), null, 2));
    return 1;
  }
  if (!isJsonObject(input.value)) {
    console.log(JSON.stringify(createErrorEnvelope('INVALID_EVIDENCE', '--evidence-file must contain a JSON object'), null, 2));
    return 1;
  }
  const evidenceInput: EvidenceInput = {
    resultId: input.value.resultId as string,
    quote: input.value.quote as string,
    charStart: input.value.charStart as number,
    charEnd: input.value.charEnd as number,
    contentHash: typeof input.value.contentHash === 'string' ? input.value.contentHash : undefined,
  };
  if (typeof evidenceInput.resultId !== 'string' || typeof evidenceInput.quote !== 'string'
    || !Number.isSafeInteger(evidenceInput.charStart) || !Number.isSafeInteger(evidenceInput.charEnd)) {
    console.log(JSON.stringify(createErrorEnvelope('MISSING_FIELDS', '--evidence-file must contain resultId, quote, charStart, and charEnd'), null, 2));
    return 1;
  }
  if (!evidenceInput.quote.trim()) {
    console.log(JSON.stringify(createErrorEnvelope('INVALID_EVIDENCE', 'Evidence quote must not be empty or whitespace'), null, 2));
    return 1;
  }

  let mutation: { evidence: EvidenceSpan; verdict: Verdict; review?: ReturnType<typeof aggregateClaim>; idempotent: boolean };
  try {
    mutation = mutateSessionState(sessionDir, () => {
      assertClaimsStoreReadable(sessionDir);
      const claims = loadClaims(sessionDir);
      const claim = claims.find(item => item.id === options.claimId);
      if (!claim) throw new EvidenceCommandError('CLAIM_NOT_FOUND', `Claim ${options.claimId} not found`);

      const result = getApprovedResults(sessionDir).find(item => item.id === evidenceInput.resultId);
      if (!result) throw new EvidenceCommandError('RESULT_NOT_APPROVED', `Result ID ${evidenceInput.resultId} is not in approved results`);
      const content = result.content!;
      if (evidenceInput.charStart < 0 || evidenceInput.charEnd > content.length || evidenceInput.charStart >= evidenceInput.charEnd) {
        throw new EvidenceCommandError('OFFSET_OUT_OF_RANGE', `charStart/charEnd out of range (content length: ${content.length})`);
      }
      const quote = content.slice(evidenceInput.charStart, evidenceInput.charEnd);
      if (quote !== evidenceInput.quote) throw new EvidenceCommandError('QUOTE_MISMATCH', 'Quote does not match source content at the provided offsets');
      const contentHash = createHash('sha256').update(quote).digest('hex');
      if ((evidenceInput.contentHash || contentHash) !== contentHash) {
        throw new EvidenceCommandError('HASH_MISMATCH', 'Content hash mismatch: quote does not match source');
      }

      const evidences = loadEvidences(sessionDir);
      const duplicate = evidences.find(item => item.claimId === claim.id
        && item.resultId === result.id
        && item.quote === evidenceInput.quote
        && item.charStart === evidenceInput.charStart
        && item.charEnd === evidenceInput.charEnd
        && !item.invalid);
      let idempotent = Boolean(duplicate);
      const evidence: EvidenceSpan = duplicate ?? {
          id: `ev_${String(evidences.length + 1).padStart(3, '0')}`,
          claimId: claim.id,
          resultId: result.id,
          resultUrl: result.url,
          quote: evidenceInput.quote,
          charStart: evidenceInput.charStart,
          charEnd: evidenceInput.charEnd,
          contentHash,
          extractedAt: result.extractedAt!,
        };
      if (!duplicate) evidences.push(evidence);

      const verdicts = loadVerdicts(sessionDir);
      let verdict = verdicts.find(item => item.claimId === claim.id && item.evidenceIds.length === 1 && item.evidenceIds[0] === evidence.id);
      const verdictChanged = !verdict || verdict.stance !== options.stance || verdict.reason !== options.reason || verdict.confidence !== options.confidence;
      if (!verdict) {
        verdict = {
          id: `vd_${String(verdicts.length + 1).padStart(3, '0')}`,
          claimId: claim.id,
          evidenceIds: [evidence.id],
          stance: options.stance,
          confidence: options.confidence,
          reason: options.reason,
          createdAt: Date.now(),
        };
        verdicts.push(verdict);
      } else if (verdictChanged) {
        verdict.stance = options.stance;
        verdict.reason = options.reason;
        verdict.confidence = options.confidence;
      }

      idempotent = idempotent && !verdictChanged;
      const reviews = loadReviews(sessionDir);
      if (verdictChanged) {
        claim.status = 'verifying';
        const reviewIndex = reviews.findIndex(item => item.claimId === claim.id);
        if (reviewIndex !== -1) reviews.splice(reviewIndex, 1);
      }
      let review: ReturnType<typeof aggregateClaim> | undefined;
      if (options.complete) {
        const validEvidences = evidences.filter(item => item.claimId === claim.id && !item.invalid);
        for (const item of validEvidences) item.sourceClusterId = computeSourceClusterId(item);
        const validIds = new Set(validEvidences.map(item => item.id));
        const claimVerdicts = verdicts.filter(item => item.claimId === claim.id && item.evidenceIds.some(id => validIds.has(id)));
        review = aggregateClaim({ claimId: claim.id, riskLevel: claim.riskLevel, verdicts: claimVerdicts, evidences: validEvidences });
        claim.status = 'reviewed';
        const reviewIndex = reviews.findIndex(item => item.claimId === claim.id);
        if (reviewIndex === -1) reviews.push(review);
        else reviews[reviewIndex] = review;
      }

      // Every retry derives the full desired state, repairing partial prior writes.
      saveEvidences(sessionDir, evidences);
      saveVerdicts(sessionDir, verdicts);
      saveClaims(sessionDir, claims);
      saveReviews(sessionDir, reviews);
      return { evidence, verdict, review, idempotent };
    });
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify(createErrorEnvelope('CLAIMS_STATE_CORRUPTED', error.message), null, 2));
      return 1;
    }
    if (error instanceof EvidenceCommandError) {
      console.log(JSON.stringify(createErrorEnvelope(error.code, error.message), null, 2));
      return 1;
    }
    throw error;
  }

  const output = {
    evidence: { id: mutation.evidence.id, claimId: options.claimId },
    verdict: { id: mutation.verdict.id, stance: mutation.verdict.stance },
    ...(mutation.idempotent ? { idempotent: true } : {}),
    ...(mutation.review ? { review: { claimId: mutation.review.claimId, decision: mutation.review.decision, matchedRule: mutation.review.matchedRule, autoPass: mutation.review.autoPass } } : {}),
  };
  if ((options.format || 'json') === 'md') {
    console.log('## Evidence-Verify Result\n');
    console.log(`**Evidence**: ${mutation.evidence.id} -> ${options.claimId}`);
    console.log(`**Verdict**: ${mutation.verdict.id} - ${mutation.verdict.stance}`);
    if (mutation.review) console.log(`**Review**: ${mutation.review.decision} (rule: ${mutation.review.matchedRule}, autoPass: ${mutation.review.autoPass})`);
  } else {
    console.log(JSON.stringify(createSuccessEnvelope(output), null, 2));
  }
  return 0;
}

export async function runEvidenceList(
  session: string,
  options: { claimId: string; format?: string; includeInvalid?: boolean },
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  let evidences: EvidenceSpan[];
  try {
    assertClaimsStoreReadable(sessionDir);
    evidences = loadEvidences(sessionDir).filter(item => item.claimId === options.claimId && (options.includeInvalid || !item.invalid));
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify(createErrorEnvelope('CLAIMS_STATE_CORRUPTED', error.message), null, 2));
      return 1;
    }
    throw error;
  }
  if ((options.format || 'json') === 'md') {
    if (!evidences.length) {
      console.log('No evidence found for this claim.');
      return 0;
    }
    console.log('## Evidence\n');
    console.log('| ID | Source | Quote |');
    console.log('|----|--------|-------|');
    for (const evidence of evidences) console.log(`| ${evidence.id} | ${evidence.resultUrl} | ${evidence.quote.slice(0, 60)}... |`);
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ evidences }), null, 2));
  }
  return 0;
}
