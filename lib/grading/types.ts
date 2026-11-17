/**
 * Shared types for the deterministic rubric-based grading system.
 *
 * Design contract (see `grading_deterministic_redesign` plan):
 * - Scores are computed in TypeScript from rubric matches, not invented by the
 *   model. Out-of-range scores are impossible by construction.
 * - A grading failure NEVER becomes a numeric score. It becomes a `pending`
 *   StoredFeedback entry that a background worker will retry.
 * - StoredFeedback is forward-compatible with the legacy
 *   `{ score, feedback, confidence, maxPoints }` shape: legacy entries (no
 *   `status` field) are treated as `'graded'` so existing data renders fine.
 */

import { PROMPT_VERSION } from '@/lib/ai/prompts/common';
import { defaultGradeModel } from '@/lib/ai/modelRouter';

export type GradingStatus = 'graded' | 'pending' | 'manual_review';

export type FailureReason =
  | 'openai_timeout'
  | 'openai_error'
  | 'empty_response'
  | 'invalid_json'
  | 'schema_validation_failed'
  | 'feedback_too_long'
  | 'rubric_unavailable'
  | 'rubric_derivation_failed'
  | 'no_api_key'
  | 'missing_reference_answer'
  | 'db_write_failed'
  | 'ai_band_exceeded'
  | 'low_confidence'
  | 'run_disagreement'
  | 'unknown';

export type RubricCriterion = {
  /** Stable id within the rubric, e.g. "c1", "c2". */
  id: string;
  /** Human-readable description of what this criterion checks for. */
  description: string;
  /** Relative weight, default 1. Partial credit awards 0.5 * weight. */
  weight: number;
  /** Alias accepted from authoring JSON (`points` ↔ `weight`). */
  points?: number;
  /** When partial credit applies: what "partial" looks like. */
  partialDescriptor?: string;
  /** Alternative terms/examples that also earn credit. */
  acceptableVariants?: string[];
};

export type RubricMatch = {
  criterionId: string;
  matched: boolean;
  /** True when student partially addresses the criterion but does not fully satisfy it. */
  partial?: boolean;
  /** Short quote from the student answer supporting the decision. */
  evidence?: string;
  /** Exact quote claimed as evidence (must appear in the student answer). */
  evidenceQuote?: string;
  /** Per-criterion confidence 0–100. */
  confidence?: number;
  /** True when evidenceQuote failed the substring check. */
  evidenceRejected?: boolean;
};

/**
 * Per-question feedback row stored in `attempts.gpt_feedback`. Legacy entries
 * may omit any of the optional fields; callers should default `status` to
 * `'graded'` when missing.
 */
export type StoredFeedback = {
  /** Null when the question is `pending` or `manual_review`. */
  score: number | null;
  feedback: string;
  confidence: number;
  maxPoints: number;
  status?: GradingStatus;
  rubric?: RubricCriterion[];
  rubricMatches?: RubricMatch[];
  modelVersion?: string;
  rubricVersion?: number;
  /** ISO-8601 UTC timestamp of the most recent grading attempt. */
  gradedAt?: string;
  /** Number of grading attempts so far (used by background worker for backoff/promotion). */
  attempts?: number;
  /** Last failure reason when status !== 'graded'. */
  failureReason?: FailureReason;
  /** True when the result was served from `grading_cache`. */
  cached?: boolean;
  /** When set, student only needs this many rubric matches for full credit (any-N questions). */
  requiredMatchCount?: number | null;
  /** Prompt provenance for explainability. */
  promptVersion?: string;
  /** Router task that produced this result (grade | grade_escalate). */
  aiTask?: string;
  /** Model tier from the smart router. */
  modelTier?: string;
};

/** Coarse top-level grading state stored on `attempts.grading_status`. */
export type AttemptGradingStatus = 'complete' | 'partial' | 'failed';

/** Model identifier for cache-key invalidation — follows the smart router. */
export const GRADING_MODEL_VERSION = defaultGradeModel();

/** Prompt provenance — bump when grading system/user prompt text changes. */
export const GRADING_PROMPT_VERSION = PROMPT_VERSION;

/**
 * Below this overall confidence (0–100 store scale) → dual-run / manual_review.
 * Model returns 0–1; v2 review threshold is 0.6 → 60.
 */
export const GRADING_CONFIDENCE_REVIEW_THRESHOLD = 60;

/** Hard ceiling for stored feedback text. Longer feedback is trimmed, never rejected. */
export const MAX_FEEDBACK_LENGTH = 400;

/**
 * Treat anything other than `status: 'graded'` (including legacy entries with
 * the old "Grading system temporarily unavailable" message) as not-finally-graded.
 */
export function isGradedStatus(status: GradingStatus | undefined): boolean {
  return status === 'graded' || status === undefined;
}

export function isPendingStatus(status: GradingStatus | undefined): boolean {
  return status === 'pending' || status === 'manual_review';
}
