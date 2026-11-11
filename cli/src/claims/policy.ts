/**
 * Policy aggregation engine — pure rule engine, no LLM.
 *
 * Input: all Verdicts + associated EvidenceSpans for one Claim
 * Output: a Review with decision and matched rule
 *
 * Rules are evaluated in order, first match wins.
 */

import {
  Verdict,
  EvidenceSpan,
  Review,
  ReviewStatus,
  ReviewChecks,
  ReviewConflict,
  SourceRelation,
} from './types.js';
import { assessSources } from './source-assessment.js';

// ── Input ───────────────────────────────────────────────────────────

export interface PolicyInput {
  claimId: string;
  riskLevel: 'low' | 'medium' | 'high';
  verdicts: Verdict[];
  evidences: EvidenceSpan[];
  relations?: SourceRelation[];
}

// ── Rule definition ─────────────────────────────────────────────────

interface Rule {
  name: string;
  evaluate(input: PolicyInput): ReviewStatus | null;
}

/**
 * Evaluate deterministic checks for a set of verdicts + evidences.
 */
function computeChecks(input: PolicyInput): ReviewChecks {
  const { verdicts, evidences } = input;
  const stanceCounts = { support: 0, refute: 0, insufficient: 0 };
  for (const v of verdicts) {
    stanceCounts[v.stance]++;
  }

  const source = assessSources(input.claimId, evidences, verdicts, input.relations ?? []);

  return {
    sourceIndependent: source.state === 'independent',
    sourceIndependence: source.state,
    sourceIndependenceReason: source.reason,
    hasRefute: stanceCounts.refute > 0,
    allSupport: stanceCounts.support > 0 && stanceCounts.refute === 0 && stanceCounts.insufficient === 0,
  };
}

/**
 * Build conflict info from verdicts+evidences for refute scenarios.
 */
function buildConflict(verdicts: Verdict[], evidences: EvidenceSpan[]): ReviewConflict | undefined {
  const refutingVerdicts = verdicts.filter(v => v.stance === 'refute');
  const supportingVerdicts = verdicts.filter(v => v.stance === 'support');

  if (refutingVerdicts.length === 0) return undefined;

  const supportingQuotes = supportingVerdicts
    .slice(0, 5)
    .map(v => {
      const ev = evidences.find(e => v.evidenceIds.includes(e.id));
      return `${v.id}: ${ev?.quote.slice(0, 100) || 'no quote'}`;
    });

  const refutingQuotes = refutingVerdicts
    .slice(0, 5)
    .map(v => {
      const ev = evidences.find(e => v.evidenceIds.includes(e.id));
      return `${v.id}: ${ev?.quote.slice(0, 100) || 'no quote'}`;
    });

  return {
    summary: `Claim is supported by ${supportingVerdicts.length} evidence(s) and refuted by ${refutingVerdicts.length} evidence(s)`,
    supporting: supportingQuotes,
    refuting: refutingQuotes,
  };
}

// ── Rules (evaluated in order) ──────────────────────────────────────

const RULES: Rule[] = [
  // #1 singleRefute: any refute → needsReview
  {
    name: 'singleRefute',
    evaluate(input) {
      const hasRefute = input.verdicts.some(v => v.stance === 'refute');
      return hasRefute ? 'needsReview' : null;
    },
  },

  {
    name: 'sourceIndependenceUnknown',
    evaluate(input) {
      const state = assessSources(input.claimId, input.evidences, input.verdicts, input.relations ?? []).state;
      return state === 'unknown' || state === 'conflict' ? 'needsReview' : null;
    },
  },

  // High-risk claims require confirmed independent supporting sources.
  {
    name: 'highRiskInsufficient',
    evaluate(input) {
      if (input.riskLevel !== 'high') return null;
      if (assessSources(input.claimId, input.evidences, input.verdicts, input.relations ?? []).state !== 'independent') return 'needsReview';
      return null;
    },
  },

  // Confirmed independent supporting sources can be approved.
  {
    name: 'dualSourceSupport',
    evaluate(input) {
      if (assessSources(input.claimId, input.evidences, input.verdicts, input.relations ?? []).state !== 'independent') return null;
      const allSupport = input.verdicts.every(v => v.stance === 'support');
      if (allSupport) return 'approved';
      return null;
    },
  },

  // An insufficient verdict prevents automatic approval.
  {
    name: 'dualSourceMixed',
    evaluate(input) {
      if (assessSources(input.claimId, input.evidences, input.verdicts, input.relations ?? []).state !== 'independent') return null;
      const hasInsufficient = input.verdicts.some(v => v.stance === 'insufficient');
      if (hasInsufficient) return 'needsReview';
      return null;
    },
  },

  // A single supported source requires review.
  {
    name: 'singleSource',
    evaluate(input) {
      const source = assessSources(input.claimId, input.evidences, input.verdicts, input.relations ?? []);
      if ((source.state === 'same' || source.state === 'insufficient') && input.verdicts.some(v => v.stance === 'support')) return 'needsReview';
      return null;
    },
  },

  // #6 allInsufficient: all verdicts are insufficient → needsReview
  {
    name: 'allInsufficient',
    evaluate(input) {
      if (input.verdicts.length === 0) return null;
      const allInsufficient = input.verdicts.every(v => v.stance === 'insufficient');
      return allInsufficient ? 'needsReview' : null;
    },
  },

  // #7 fallback: catch-all
  {
    name: 'fallback',
    evaluate() {
      return 'needsReview';
    },
  },
];

// ── Aggregation ─────────────────────────────────────────────────────

/**
 * Run all rules against a single claim's data and produce a Review.
 */
export function aggregateClaim(input: PolicyInput): Review {
  const checks = computeChecks(input);

  let decision: ReviewStatus = 'needsReview';
  let matchedRule = 'fallback';

  for (const rule of RULES) {
    const result = rule.evaluate(input);
    if (result !== null) {
      decision = result;
      matchedRule = rule.name;
      break;
    }
  }

  const review: Review = {
    claimId: input.claimId,
    decision,
    autoPass: decision === 'approved',
    checks,
    matchedRule,
    reviewer: 'agent',
    reviewedAt: Date.now(),
  };

  // Populate conflict only when refute exists
  if (checks.hasRefute) {
    review.conflict = buildConflict(input.verdicts, input.evidences);
  }

  return review;
}

/**
 * Aggregate all claims that have verdicts but no review yet.
 * Returns the new reviews.
 */
export function aggregateAll(
  claimVerdicts: Array<PolicyInput>
): Review[] {
  return claimVerdicts.map(aggregateClaim);
}
