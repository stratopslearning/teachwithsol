/**
 * Server-side helpers that surface attempts needing a professor's review.
 *
 * "Needs attention" = an attempt belonging to a section the professor teaches
 * where AT LEAST ONE short-answer question is not finally graded:
 *   - `gradingStatus IN ('partial', 'failed')` (new pipeline)
 *   - OR any gpt_feedback entry has the legacy "Grading system temporarily
 *     unavailable" message (old fallback grader)
 *
 * The list is small in practice (typically <100 rows) so we read the
 * candidate set and post-process counts in JS instead of pushing it all
 * into SQL. Pre-filtering by `gradingStatus` (indexed) keeps the scan
 * cheap; the legacy fallback scan is a secondary filter on the same set
 * plus any attempts where `gradingStatus IS NULL` for the professor's
 * sections that contain the magic string.
 */
import { and, inArray, isNotNull, or, sql } from 'drizzle-orm';

import { groupSectionIdsByTenant } from '@/lib/db/sectionTenants';
import { withTenant } from '@/lib/db/tenantContext';
import { attempts } from '@/app/db/schema';
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import {
  isFallbackGradingFeedback,
  isPendingFeedback,
} from '@/lib/regradeAttempt';

export type AttentionItem = {
  /** Tenant that owns the attempt (bulk regrade queues jobs under it). */
  tenantId: string;
  attemptId: string;
  student: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  quiz: {
    id: string;
    title: string;
  };
  section: {
    id: string;
    name: string;
    course: { title: string } | null;
  };
  submittedAt: Date | null;
  gradingStatus: 'partial' | 'failed' | 'complete' | 'legacy' | null;
  pendingCount: number;
  manualReviewCount: number;
  legacyFallbackCount: number;
  totalShortAnswer: number;
  percentage: number | null;
  /** Sum of `pendingCount + manualReviewCount + legacyFallbackCount` for sort/badge. */
  needsAttentionCount: number;
};

const FALLBACK_SNIPPET = 'Grading system temporarily unavailable';

function isShortAnswerEntry(value: unknown): value is { maxPoints?: number } {
  return !!value && typeof value === 'object' && 'maxPoints' in (value as object);
}

function summariseFeedback(gptFeedback: unknown): {
  pendingCount: number;
  manualReviewCount: number;
  legacyFallbackCount: number;
  totalShortAnswer: number;
} {
  if (!gptFeedback || typeof gptFeedback !== 'object') {
    return {
      pendingCount: 0,
      manualReviewCount: 0,
      legacyFallbackCount: 0,
      totalShortAnswer: 0,
    };
  }
  let pendingCount = 0;
  let manualReviewCount = 0;
  let legacyFallbackCount = 0;
  let totalShortAnswer = 0;

  for (const [key, value] of Object.entries(
    gptFeedback as Record<string, unknown>,
  )) {
    // Skip non-question metadata buckets stored on the gptFeedback object.
    if (
      key === 'attemptNumber' ||
      key === 'maxAttempts' ||
      key === 'totalAttempts'
    )
      continue;
    if (!isShortAnswerEntry(value)) continue;
    totalShortAnswer += 1;

    const status = (value as { status?: string }).status;
    if (status === 'pending') {
      pendingCount += 1;
      continue;
    }
    if (status === 'manual_review') {
      manualReviewCount += 1;
      continue;
    }
    if (status === 'graded') continue;

    // Legacy attempts (predate the redesign) carry no explicit status. They
    // are flagged as fallback when they match either of the historical
    // signatures: the magic feedback string or `confidence === 30`.
    const feedbackText = (value as { feedback?: string }).feedback;
    const confidence = (value as { confidence?: number }).confidence;
    if (
      (typeof feedbackText === 'string' && feedbackText.includes(FALLBACK_SNIPPET)) ||
      confidence === 30 ||
      isFallbackGradingFeedback(value) ||
      isPendingFeedback(value)
    ) {
      legacyFallbackCount += 1;
    }
  }
  return { pendingCount, manualReviewCount, legacyFallbackCount, totalShortAnswer };
}

export async function getAttentionItemsForProfessor(
  professorId: string,
  options: { limit?: number; sectionIds?: string[] } = {},
): Promise<AttentionItem[]> {
  // Binding-derived sections only (professor_sections is metadata).
  const teaching = await listTeachingSectionIds({ id: professorId });
  const sectionIds = options.sectionIds
    ? options.sectionIds.filter((id) => teaching.includes(id))
    : teaching;
  if (sectionIds.length === 0) return [];

  const limit = Math.max(1, Math.min(options.limit ?? 100, 500));

  // Two paths combined with OR (executed as a single query):
  //   1. New pipeline: gradingStatus IN ('partial', 'failed')
  //   2. Legacy:       gpt_feedback contains the fallback message string
  const fallbackMatch = sql<boolean>`${attempts.gptFeedback}::text LIKE ${'%' + FALLBACK_SNIPPET + '%'}`;
  // FORCE RLS: a plain db read returns no attempts, so the queue was always
  // empty. Read each tenant's sections under that tenant, then merge.
  const byTenant = await groupSectionIdsByTenant(sectionIds);
  const perTenant = await Promise.all(
    [...byTenant].map(async ([tenantId, ids]) => {
      const tenantRows = await withTenant(tenantId, professorId, (tx) =>
        tx.query.attempts.findMany({
          where: and(
            isNotNull(attempts.submittedAt),
            inArray(attempts.sectionId, ids),
            or(
              inArray(attempts.gradingStatus, ['partial', 'failed']),
              fallbackMatch,
            ),
          ),
          with: {
            student: true,
            quiz: { columns: { id: true, title: true } },
            section: { with: { course: { columns: { title: true } } } },
          },
          orderBy: (cols, { desc }) => [desc(cols.submittedAt)],
          limit,
        }),
      );
      return tenantRows.map((row) => ({ ...row, tenantId }));
    }),
  );
  const submittedTime = (d: Date | null) => (d ? new Date(d).getTime() : 0);
  const rows = perTenant
    .flat()
    .sort((a, b) => submittedTime(b.submittedAt) - submittedTime(a.submittedAt))
    .slice(0, limit);

  return rows.map<AttentionItem>((row) => {
    const counts = summariseFeedback(row.gptFeedback);
    const status =
      row.gradingStatus === 'partial' ||
      row.gradingStatus === 'failed' ||
      row.gradingStatus === 'complete'
        ? row.gradingStatus
        : counts.legacyFallbackCount > 0
          ? 'legacy'
          : null;

    return {
      tenantId: row.tenantId,
      attemptId: row.id,
      student: {
        id: row.student.id,
        firstName: row.student.firstName,
        lastName: row.student.lastName,
        email: row.student.email,
      },
      quiz: { id: row.quiz.id, title: row.quiz.title },
      section: {
        id: row.section.id,
        name: row.section.name,
        course: row.section.course ? { title: row.section.course.title } : null,
      },
      submittedAt: row.submittedAt,
      gradingStatus: status,
      pendingCount: counts.pendingCount,
      manualReviewCount: counts.manualReviewCount,
      legacyFallbackCount: counts.legacyFallbackCount,
      totalShortAnswer: counts.totalShortAnswer,
      percentage: row.percentage,
      needsAttentionCount:
        counts.pendingCount +
        counts.manualReviewCount +
        counts.legacyFallbackCount,
    };
  });
}
