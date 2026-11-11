/**
 * Policy aggregation and review-list commands.
 */

import {
  loadClaims,
  loadReviews,
  loadReviewHistory,
  loadEvidences,
  loadVerdicts,
  saveReviews,
  saveClaims,
  saveEvidences,
  ClaimsStateError,
  assertClaimsStoreReadable,
} from '../claims/store.js';
import { computeSourceClusterId } from '../claims/deterministic-checks.js';
import {
  aggregateAll,
  PolicyInput,
} from '../claims/policy.js';
import { mutateSessionState, resolveSessionPath } from '../deep/session.js';
import { createSuccessEnvelope } from '../protocol.js';

// policy-aggregate

export async function runPolicyAggregate(
  session: string,
  options: {
    claimId?: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  let newReviews;
  try {
    newReviews = mutateSessionState(sessionDir, () => {
      assertClaimsStoreReadable(sessionDir);
      const allClaims = loadClaims(sessionDir);
      const allEvidences = loadEvidences(sessionDir);
      const allVerdicts = loadVerdicts(sessionDir);
      const existingReviews = loadReviews(sessionDir);

      const reviewedClaimIds = new Set(existingReviews.map(review => review.claimId));
      let targets = options.claimId
        ? allClaims.filter(claim => claim.id === options.claimId)
        : allClaims.filter(claim => claim.status === 'verifying' || (claim.status === 'reviewed' && !reviewedClaimIds.has(claim.id)));
      if (options.claimId && targets.length === 0) return [];

      const reviewable: Array<{ claim: typeof allClaims[0]; input: PolicyInput }> = [];
      for (const claim of targets) {
        const evidences = allEvidences.filter(evidence => evidence.claimId === claim.id && !evidence.invalid);
        const validEvidenceIds = new Set(evidences.map(evidence => evidence.id));
        const verdicts = allVerdicts.filter(verdict => verdict.claimId === claim.id && verdict.evidenceIds.some(id => validEvidenceIds.has(id)));
        if (!verdicts.length) continue;
        for (const evidence of evidences) evidence.sourceClusterId = computeSourceClusterId(evidence);
        reviewable.push({
          claim,
          input: { claimId: claim.id, riskLevel: claim.riskLevel, verdicts, evidences },
        });
      }
      if (!reviewable.length) return [];

      const reviews = aggregateAll(reviewable.map(item => item.input));
      const reviewMap = new Map(existingReviews.map(review => [review.claimId, review]));
      for (const review of reviews) reviewMap.set(review.claimId, review);
      for (const { claim } of reviewable) claim.status = 'reviewed';
      saveEvidences(sessionDir, allEvidences);
      saveClaims(sessionDir, allClaims);
      saveReviews(sessionDir, [...reviewMap.values()]);
      return reviews;
    });
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify({ status: 'error', error: { code: 'CLAIMS_STATE_CORRUPTED', message: error.message } }, null, 2));
      return 1;
    }
    throw error;
  }
  if (newReviews.length === 0) {
    // The empty case is still a result the caller asked to be formatted: a
    // `-f md` caller that gets an envelope has to parse JSON after asking for
    // markdown, so the format decision is made before the early return.
    if ((options.format || 'json') === 'md') {
      console.log('## Policy Aggregate Results\n');
      console.log('No claims with verdicts to aggregate.');
    } else {
      console.log(JSON.stringify(createSuccessEnvelope({ message: 'No claims with verdicts to aggregate' }), null, 2));
    }
    return 0;
  }

  // Output
  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    console.log('## Policy Aggregate Results\n');
    console.log(`Aggregated ${newReviews.length} claim(s)\n`);
    console.log('| Claim ID | Decision | Rule | Auto-Pass |');
    console.log('|----------|----------|------|-----------|');
    for (const r of newReviews) {
      console.log(`| ${r.claimId} | ${r.decision} | ${r.matchedRule} | ${r.autoPass} |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({
      aggregated: newReviews.length,
      reviews: newReviews,
    }), null, 2));
  }

  return 0;
}

export async function runReviewList(
  session: string,
  options: {
    status?: string;
    format?: string;
  }
): Promise<number> {
  const sessionDir = resolveSessionPath(session);
  let all;
  let history;
  try {
    assertClaimsStoreReadable(sessionDir);
    all = loadReviews(sessionDir);
    history = loadReviewHistory(sessionDir);
  } catch (error) {
    if (error instanceof ClaimsStateError) {
      console.log(JSON.stringify({ status: 'error', error: { code: 'CLAIMS_STATE_CORRUPTED', message: error.message } }, null, 2));
      return 1;
    }
    throw error;
  }

  const filtered = options.status
    ? all.filter(r => r.decision === options.status)
    : all;
  const filteredHistory = options.status ? history.filter(r => r.decision === options.status) : history;

  const outputFormat = options.format || 'json';
  if (outputFormat === 'md') {
    if (filtered.length === 0 && filteredHistory.length === 0) {
      console.log('No reviews found.');
      return 0;
    }
    console.log('## Reviews\n');
    console.log('| Claim ID | Decision | Rule | Auto-Pass |');
    console.log('|----------|----------|------|-----------|');
    for (const r of filtered) {
      console.log(`| ${r.claimId} | ${r.decision} | ${r.matchedRule} | ${r.autoPass} |`);
    }
    if (filteredHistory.length) {
      console.log('\n### Historical reviews (not current)\n');
      console.log('| Claim ID | Decision | Rule | Invalidated at |');
      console.log('|----------|----------|------|----------------|');
      for (const r of filteredHistory) console.log(`| ${r.claimId} | ${r.decision} | ${r.matchedRule} | ${r.invalidatedAt} |`);
    }
  } else {
    console.log(JSON.stringify(createSuccessEnvelope({ reviews: filtered, history: filteredHistory }), null, 2));
  }

  return 0;
}
