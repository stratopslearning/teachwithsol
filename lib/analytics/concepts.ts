import { and, eq, inArray } from 'drizzle-orm';

import { db } from '@/app/db';
import { questions, quizSections, quizzes } from '@/app/db/schema';
import { resolveAnalyticsSectionIds } from '@/lib/analytics/access';
import {
  aggregateConceptMastery,
  type ConceptMasteryRow,
  type TagCoverage,
} from '@/lib/analytics/aggregateConcepts';
import { suppressConceptRows } from '@/lib/analytics/kAnonymity';
import { activeOnly } from '@/lib/db/filters';
import type { AuthUser } from '@/lib/getOrCreateUser';
import { fetchSubmittedAttemptsForProfessorSections } from '@/lib/professorVisibleAttempts';
import {
  computeQuestionStatsForAttempts,
  type QuizQuestionForStats,
} from '@/lib/quizQuestionStats';

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

  const links = await db.query.quizSections.findMany({
    where: inArray(quizSections.sectionId, sectionIds),
    columns: { quizId: true },
  });
  const quizIds = [...new Set(links.map((l) => l.quizId))];
  if (quizIds.length === 0) {
    return {
      concepts: [],
      tagCoverage: { totalQuestions: 0, taggedQuestions: 0, percent: 0 },
    };
  }

  const quizRows = await db.query.quizzes.findMany({
    where: and(inArray(quizzes.id, quizIds), activeOnly(quizzes.deletedAt)),
    columns: { id: true },
  });
  const activeQuizIds = quizRows.map((q) => q.id);
  if (activeQuizIds.length === 0) {
    return {
      concepts: [],
      tagCoverage: { totalQuestions: 0, taggedQuestions: 0, percent: 0 },
    };
  }

  const allStats: ReturnType<typeof computeQuestionStatsForAttempts> = [];

  for (const quizId of activeQuizIds) {
    const quizQuestions = await db.query.questions.findMany({
      where: eq(questions.quizId, quizId),
      orderBy: (q, { asc }) => [asc(q.order)],
    });

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
