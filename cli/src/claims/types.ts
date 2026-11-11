/**
 * Claim—Evidence—Review types for automatic audit pipeline.
 *
 * All field names use camelCase per project convention.
 * String literal values (status, stance, decision) use lower_case
 * to match existing SessionResult.status pattern.
 */

// ── Claim ───────────────────────────────────────────────────────────

export interface Claim {
  /** Assigned by CLI: cl_<seq>, auto-increment per session */
  id: string;

  /** Raw claim text */
  text: string;

  /** Semantic decomposition (provided by Agent, CLI does not validate) */
  subject?: string;
  predicate?: string;
  object?: string;

  /** Time constraint, e.g. "2025-06", "Q3 2025" */
  time?: string;

  /** Risk classification (Agent-assigned) */
  riskLevel: 'low' | 'medium' | 'high';

  /**
   * Lifecycle status
   * - pending:    submitted, no evidence yet
   * - verifying:  has EvidenceSpan(s), awaiting policy aggregation
   * - reviewed:   policy aggregation complete
   */
  status: 'pending' | 'verifying' | 'reviewed';

  /** Owning session directory */
  sessionDir: string;

  /** Creation timestamp */
  createdAt: number;
}

// ── EvidenceSpan ────────────────────────────────────────────────────

export interface EvidenceSpan {
  id: string;
  claimId: string;

  /** Stable approved result ID this evidence points to */
  resultId: string;

  /** Display-only URL retained for audit readability. */
  resultUrl?: string;

  /** Verbatim quote from source */
  quote: string;

  /** Offset in UTF-16 code units (JS .slice() convention) */
  charStart: number;
  charEnd: number;

  /** SHA256 hex digest of the exact quote slice */
  contentHash: string;

  snapshotId?: string;
  snapshotBinding?: 'current_match' | 'needs_check' | 'anchored';
  relocationStatus?: 'matched' | 'needs_check';
  anchorHistory?: Array<{ snapshotId: string; charStart: number; charEnd: number; extractedAt: number; snapshotBinding?: 'current_match' | 'needs_check' | 'anchored' }>;

  /** Timestamp of the source content extraction used for this evidence */
  extractedAt: number;

  /** Source publish date (inherited from SessionResult.publishedDate) */
  publishedDate?: string;

  /** Source author / site name (set dynamically by mergeExtractedContent) */
  author?: string;
  siteName?: string;

  /**
   * Domain-level source cluster ID.
   * null on write; computed on-demand during policy-aggregate.
   * Derived from: normalized publisher domain → SHA256 → 16 hex chars.
   */
  sourceClusterId?: string;

  invalid?: boolean;
  invalidatedAt?: number;
  invalidationReason?: 'contentChanged' | 'sourceSkipped';
}

// ── Verdict ─────────────────────────────────────────────────────────

export interface Verdict {
  id: string;
  claimId: string;
  evidenceIds: string[];       // One or more associated evidence IDs
  stance: 'support' | 'refute' | 'insufficient';
  confidence?: number;          // Agent's own confidence (optional)
  reason: string;               // Judgement rationale, for audit
  createdAt: number;
}

// ── Review ──────────────────────────────────────────────────────────

export type ReviewStatus = 'approved' | 'needsReview' | 'rejected';

export interface ReviewChecks {
  sourceIndependent: boolean;   // >= 2 distinct publisher domains
  hasRefute: boolean;           // refutation evidence exists
  allSupport: boolean;          // all evidence stance is 'support'
}

export interface ReviewConflict {
  summary: string;
  supporting: string[];
  refuting: string[];
}

export interface Review {
  claimId: string;
  decision: ReviewStatus;
  autoPass: boolean;            // true = CLI rules auto-approved, false = Agent needs to handle

  /** Deterministic check results */
  checks: ReviewChecks;

  /** Conflict info (populated when refute exists) */
  conflict?: ReviewConflict;

  /** Matched rule name */
  matchedRule: string;

  /** Reviewer (always "agent" for now) */
  reviewer: string;
  reviewedAt: number;
}
