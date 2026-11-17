import {
  isFallbackGradingFeedback,
  isPendingFeedback,
} from '@/lib/grading/regradeAttempt';
import type { StoredFeedback } from '@/lib/grading/types';

/** Gradebook status labels from SOL platform doc §9 (Assessment module). */
export type AttemptGradebookStatus =
  | 'waiting'
  | 'ai_graded'
  | 'needs_review'
  | 'overridden'
  | 'released';

export const ATTEMPT_GRADEBOOK_STATUS_LABEL: Record<
  AttemptGradebookStatus,
  string
> = {
  waiting: 'Waiting',
  ai_graded: 'AI graded',
  needs_review: 'Needs review',
  overridden: 'Overridden',
  released: 'Released',
};

const FEEDBACK_SKIP_KEYS = new Set([
  'attemptNumber',
  'maxAttempts',
  'totalAttempts',
]);

function isShortAnswerFeedback(value: unknown): value is StoredFeedback {
  return !!value && typeof value === 'object' && 'maxPoints' in (value as object);
}

export function summarizeShortAnswerGrading(gptFeedback: unknown): {
  pendingCount: number;
  manualReviewCount: number;
  legacyFallbackCount: number;
} {
  if (!gptFeedback || typeof gptFeedback !== 'object') {
    return { pendingCount: 0, manualReviewCount: 0, legacyFallbackCount: 0 };
  }

  let pendingCount = 0;
  let manualReviewCount = 0;
  let legacyFallbackCount = 0;

  for (const [key, value] of Object.entries(
    gptFeedback as Record<string, unknown>,
  )) {
    if (FEEDBACK_SKIP_KEYS.has(key)) continue;
    if (!isShortAnswerFeedback(value)) continue;

    const status = value.status;
    if (status === 'pending') {
      pendingCount += 1;
      continue;
    }
    if (status === 'manual_review') {
      manualReviewCount += 1;
      continue;
    }
    if (isFallbackGradingFeedback(value)) {
      legacyFallbackCount += 1;
      continue;
    }
    if (isPendingFeedback(value)) {
      pendingCount += 1;
    }
  }

  return { pendingCount, manualReviewCount, legacyFallbackCount };
}

export function deriveAttemptGradebookStatus(opts: {
  gradingStatus: string | null | undefined;
  gptFeedback: unknown;
  hasGradeOverride: boolean;
  gradesReleased: boolean;
}): AttemptGradebookStatus {
  const { pendingCount, manualReviewCount, legacyFallbackCount } =
    summarizeShortAnswerGrading(opts.gptFeedback);

  const waiting = pendingCount > 0 || opts.gradingStatus === 'partial';

  const needsReview =
    manualReviewCount > 0 ||
    legacyFallbackCount > 0 ||
    opts.gradingStatus === 'failed';

  if (waiting) return 'waiting';
  if (needsReview) return 'needs_review';
  if (opts.hasGradeOverride) return 'overridden';
  if (opts.gradesReleased) return 'released';
  return 'ai_graded';
}

export function gradebookStatusBadgeVariant(
  status: AttemptGradebookStatus,
): 'warning' | 'success' | 'destructive' | 'accent' | 'info' | 'outline' {
  switch (status) {
    case 'waiting':
      return 'warning';
    case 'needs_review':
      return 'destructive';
    case 'overridden':
      return 'accent';
    case 'released':
      return 'success';
    case 'ai_graded':
    default:
      return 'info';
  }
}
