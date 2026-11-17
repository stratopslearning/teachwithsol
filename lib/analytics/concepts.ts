import { and, inArray } from 'drizzle-orm';

import { quizSections, quizzes } from '@/app/db/schema';
import { readBySectionTenants } from '@/lib/db/sectionTenants';
import { withTenant } from '@/lib/db/tenantContext';
import { loadQuizQuestions } from '@/lib/quiz/gradingData';
import { resolveAnalyticsSectionIds } from '@/lib/analytics/access';
import {
  aggregateConceptMastery,
  type ConceptMasteryRow,
  type TagCoverage,
} from '@/lib/analytics/aggregateConcepts';
import { suppressConceptRows } from '@/lib/analytics/kAnonymity';
import { activeOnly } from '@/lib/db/filters';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { fetchSubmittedAttemptsForProfessorSections } from '@/lib/professor/visibleAttempts';
import {
  computeQuestionStatsForAttempts,
  type QuizQuestionForStats,
} from '@/lib/quiz/questionStats';

export async function getConceptMastery(
  user: AuthUser,
  courseId: string,
  opts?: { sectionId?: string | null },
): Promise<{ concepts: ConceptMasteryRow[]; tagCoverage: TagCoverage }> {
  const { sectionIds } = await resolveAnalyticsSectionIds(
    user,
    courseId,
    opts?.sectionId,
  );
  if (sectionIds.length === 0) {
    return {
      concepts: [],
      tagCoverage: { totalQuestions: 0, taggedQuestions: 0, percent: 0 },
    };
  }

  // FORCE RLS: plain db reads return nothing (concept mastery was always
  // empty). Read each tenant's share of the sections under that tenant.
  const links = await readBySectionTenants(sectionIds, user.id, async (tx, ids, tenantId) =>
    (
      await tx.query.quizSections.findMany({
        where: inArray(quizSections.sectionId, ids),
        columns: { quizId: true },
      })
    ).map((l) => ({ ...l, tenantId })),
  );
  const tenantOfQuiz = new Map(links.map((l) => [l.quizId, l.tenantId]));
  const quizIds = [...new Set(links.map((l) => l.quizId))];
  if (quizIds.length === 0) {
    return {
      concepts: [],
      tagCoverage: { totalQuestions: 0, taggedQuestions: 0, percent: 0 },
    };
  }

  const quizIdsByTenant = new Map<string, string[]>();
  for (const id of quizIds) {
    const t = tenantOfQuiz.get(id)!;
    quizIdsByTenant.set(t, [...(quizIdsByTenant.get(t) ?? []), id]);
  }
  const quizRows = (
    await Promise.all(
      [...quizIdsByTenant].map(([tenantId, ids]) =>
        withTenant(tenantId, user.id, (tx) =>
          tx.query.quizzes.findMany({
            where: and(inArray(quizzes.id, ids), activeOnly(quizzes.deletedAt)),
            columns: { id: true },
          }),
        ),
      ),
    )
  ).flat();
  const activeQuizIds = quizRows.map((q) => q.id);
  if (activeQuizIds.length === 0) {
    return {
      concepts: [],
      tagCoverage: { totalQuestions: 0, taggedQuestions: 0, percent: 0 },
    };
  }

  const allStats: ReturnType<typeof computeQuestionStatsForAttempts> = [];

  for (const quizId of activeQuizIds) {
    const quizQuestions = await loadQuizQuestions(quizId, tenantOfQuiz.get(quizId)!);

    const forStats: QuizQuestionForStats[] = quizQuestions.map((q) => ({
      id: q.id,
      order: q.order,
      question: q.question,
      correctAnswer: q.correctAnswer,
      type: q.type as QuizQuestionForStats['type'],
      points: q.points,
      conceptTags: (q.conceptTags ?? []) as string[],
    }));

    const attempts = await fetchSubmittedAttemptsForProfessorSections({
      quizId,
      professorSectionIds: sectionIds,
      restrictToSectionId: opts?.sectionId ?? undefined,
      includePayloads: true,
    });

    const stats = computeQuestionStatsForAttempts(
      forStats,
      attempts.map((a) => ({
        answers: 'answers' in a ? a.answers : undefined,
        gptFeedback: 'gptFeedback' in a ? a.gptFeedback : undefined,
      })),
    );
    allStats.push(...stats);
  }

  const agg = aggregateConceptMastery(allStats);
  // k-anonymity: hide outcome numbers for concepts with fewer than K attempts.
  return { ...agg, concepts: suppressConceptRows(agg.concepts) };
}
