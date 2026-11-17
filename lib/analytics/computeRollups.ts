import { and, eq, isNotNull, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  analyticsRollups,
  attempts,
  courseOfferings,
  sections,
} from '@/app/db/schema';
import { withTenant } from '@/lib/db/tenantContext';
import type { RubricMatch, StoredFeedback } from '@/lib/grading/types';
import { parseAttemptJsonRecord } from '@/lib/quiz/questionStats';

export type CriterionMissRate = {
  criterionId: string;
  description: string;
  evaluated: number;
  missed: number;
  missRate: number;
};

export type WhatToChangeSuggestion = {
  id: string;
  kind: 'criterion_miss_rate';
  quizId: string;
  questionId: string;
  criterionId: string;
  description: string;
  missRate: number;
  evaluated: number;
  title: string;
};

const SUGGESTION_MISS_RATE_THRESHOLD = 0.45;
const SUGGESTION_MIN_EVALUATED = 5;

function accumulateCriterionMisses(
  gptFeedback: unknown,
  acc: Map<
    string,
    { quizId: string; questionId: string; criterionId: string; description: string; evaluated: number; missed: number }
  >,
  quizId: string,
) {
  const record = parseAttemptJsonRecord(gptFeedback);
  for (const [questionId, raw] of Object.entries(record)) {
    if (!raw || typeof raw !== 'object') continue;
    const fb = raw as StoredFeedback;
    if (fb.status && fb.status !== 'graded') continue;
    const matches = fb.rubricMatches ?? [];
    const rubric = fb.rubric ?? [];
    for (const match of matches as RubricMatch[]) {
      const desc =
        rubric.find((c) => c.id === match.criterionId)?.description ??
        match.criterionId;
      const key = `${quizId}:${questionId}:${match.criterionId}`;
      const row = acc.get(key) ?? {
        quizId,
        questionId,
        criterionId: match.criterionId,
        description: desc,
        evaluated: 0,
        missed: 0,
      };
      row.evaluated += 1;
      if (!match.matched) row.missed += 1;
      acc.set(key, row);
    }
  }
}

export async function computeRollupsForCourse(opts: {
  tenantId: string;
  courseId: string;
  offeringId?: string | null;
  sectionId?: string | null;
}): Promise<{ kind: string; suggestions: WhatToChangeSuggestion[] }> {
  // FORCE RLS on attempts / analytics_rollups requires a pinned tenant GUC.
  return withTenant(opts.tenantId, null, async (tx) => {
    const sectionFilter = opts.sectionId
      ? eq(attempts.sectionId, opts.sectionId)
      : sql`true`;

    const rows = await tx
      .select({
        quizId: attempts.quizId,
        gptFeedback: attempts.gptFeedback,
      })
      .from(attempts)
      .innerJoin(sections, eq(sections.id, attempts.sectionId))
      .where(
        and(
          eq(sections.courseId, opts.courseId),
          isNotNull(attempts.submittedAt),
          sectionFilter,
        ),
      );

    const acc = new Map<
      string,
      {
        quizId: string;
        questionId: string;
        criterionId: string;
        description: string;
        evaluated: number;
        missed: number;
      }
    >();

    for (const row of rows) {
      accumulateCriterionMisses(row.gptFeedback, acc, row.quizId);
    }

    const criteria: CriterionMissRate[] = [...acc.values()].map((r) => ({
      criterionId: r.criterionId,
      description: r.description,
      evaluated: r.evaluated,
      missed: r.missed,
      missRate: r.evaluated > 0 ? r.missed / r.evaluated : 0,
    }));

    const suggestions: WhatToChangeSuggestion[] = [...acc.values()]
      .filter(
        (r) =>
          r.evaluated >= SUGGESTION_MIN_EVALUATED &&
          r.missed / r.evaluated >= SUGGESTION_MISS_RATE_THRESHOLD,
      )
      .sort((a, b) => b.missed / b.evaluated - a.missed / a.evaluated)
      .slice(0, 25)
      .map((r) => ({
        id: `${r.quizId}:${r.questionId}:${r.criterionId}`,
        kind: 'criterion_miss_rate' as const,
        quizId: r.quizId,
        questionId: r.questionId,
        criterionId: r.criterionId,
        description: r.description,
        missRate: r.missed / r.evaluated,
        evaluated: r.evaluated,
        title: `Reteach: ${r.description.slice(0, 120)}`,
      }));

    const payload = {
      courseId: opts.courseId,
      criteria,
      suggestions,
      attemptCount: rows.length,
    };

    await tx
      .insert(analyticsRollups)
      .values({
        tenantId: opts.tenantId,
        offeringId: opts.offeringId ?? null,
        sectionId: opts.sectionId ?? null,
        kind: 'criterion_miss_rates',
        payload,
        computedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          analyticsRollups.tenantId,
          analyticsRollups.offeringId,
          analyticsRollups.sectionId,
          analyticsRollups.kind,
        ],
        set: {
          payload,
          computedAt: new Date(),
        },
      });

    return { kind: 'criterion_miss_rates', suggestions };
  });
}

/** Cron / Inngest entry: recompute rollups for active offerings. */
export async function computeAllAnalyticsRollups(opts?: {
  limit?: number;
}): Promise<{ coursesProcessed: number }> {
  const limit = opts?.limit ?? 200;
  const offerings = await db.query.courseOfferings.findMany({
    where: eq(courseOfferings.status, 'active'),
    limit,
    columns: { id: true, courseId: true, tenantId: true },
  });

  let coursesProcessed = 0;
  for (const off of offerings) {
    if (!off.tenantId) continue;
    await computeRollupsForCourse({
      tenantId: off.tenantId,
      courseId: off.courseId,
      offeringId: off.id,
    });
    coursesProcessed += 1;
  }
  return { coursesProcessed };
}
