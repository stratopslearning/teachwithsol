/**
 * Instructor grade overrides: insert rows and recompute attempt totals from
 * the latest override per question (plus optional whole-attempt override).
 */
import { asc, eq } from 'drizzle-orm';

import {
  attempts,
  gradeOverrides,
  questions,
  type gradeOverrides as gradeOverridesTable,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { computeScoreFromRubric } from '@/lib/grading/rubric';
import type { RubricCriterion, StoredFeedback } from '@/lib/grading/types';
import {
  buildLegacyQuestionKeyMap,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
} from '@/lib/quiz/attemptAnswers';
import { scoreOutcome } from '@/lib/quiz/score';
import { loadAttemptForGrading, loadQuizQuestions } from '@/lib/quiz/gradingData';
import { withTenant } from '@/lib/db/tenantContext';

export type GradeOverrideInput = {
  attemptId: string;
  questionId?: string | null;
  numericScore?: number | null;
  criteriaOverrides?: Record<string, boolean> | null;
  note: string;
  actorUserId: string;
};

export type GradeOverrideRow = typeof gradeOverridesTable.$inferSelect;

export { quizGradesAreReleased } from '@/lib/professor/gradesReleased';

function clampScore(score: number, maxPoints: number): number {
  if (maxPoints <= 0) return 0;
  return Math.min(Math.max(Math.round(score), 0), maxPoints);
}

type LatestOverrides = {
  byQuestionId: Map<string, GradeOverrideRow>;
  wholeAttempt: GradeOverrideRow | null;
};

function buildLatestOverrides(rows: GradeOverrideRow[]): LatestOverrides {
  const byQuestionId = new Map<string, GradeOverrideRow>();
  let wholeAttempt: GradeOverrideRow | null = null;
  for (const row of rows) {
    if (row.questionId == null) {
      wholeAttempt = row;
    } else {
      byQuestionId.set(row.questionId, row);
    }
  }
  return { byQuestionId, wholeAttempt };
}

function mergeCriteriaMatches(
  feedback: StoredFeedback | undefined,
  criteriaOverrides: Record<string, boolean>,
): { criterionId: string; matched: boolean; partial?: boolean }[] {
  const rubric = feedback?.rubric ?? [];
  const existing = feedback?.rubricMatches ?? [];
  const byId = new Map(existing.map((m) => [m.criterionId, m]));

  for (const [criterionId, met] of Object.entries(criteriaOverrides)) {
    const prior = byId.get(criterionId);
    byId.set(criterionId, {
      criterionId,
      matched: met,
      partial: met ? false : prior?.partial,
      evidence: prior?.evidence,
    });
  }

  if (rubric.length > 0) {
    return rubric.map((c: RubricCriterion) => {
      const match = byId.get(c.id);
      return {
        criterionId: c.id,
        matched: match?.matched ?? false,
        partial: match?.partial,
      };
    });
  }

  return [...byId.values()].map((m) => ({
    criterionId: m.criterionId,
    matched: m.matched,
    partial: m.partial,
  }));
}

export type EffectiveAttemptScore = {
  totalScore: number;
  maxScore: number;
  percentage: number;
  passed: boolean;
  perQuestionScores: Record<string, number>;
};

/**
 * Compute attempt score from stored answers, gpt_feedback, and the latest
 * override rows (ordered by created_at ascending; last wins per target).
 */
export async function computeEffectiveAttemptScore(
  attemptId: string,
  overrideRows?: GradeOverrideRow[],
): Promise<EffectiveAttemptScore> {
  // FORCE RLS: plain db reads return nothing here. Find the attempt's tenant
  // via the definer and read under it.
  const found = await loadAttemptForGrading(attemptId);
  if (!found?.tenantId) throw ApiError.notFound('Attempt not found');
  const tenantId = found.tenantId;

  const { attempt, quizQuestions, storedRows } = await withTenant(
    tenantId,
    null,
    async (tx) => {
      const attempt = await tx.query.attempts.findFirst({
        where: eq(attempts.id, attemptId),
        with: { quiz: { columns: { passingScore: true } } },
      });
      if (!attempt) return { attempt, quizQuestions: [], storedRows: [] };
      return {
        attempt,
        quizQuestions: await tx.query.questions.findMany({
          where: eq(questions.quizId, attempt.quizId),
          orderBy: (q, { asc: ascOp }) => ascOp(q.order),
        }),
        storedRows: overrideRows
          ? []
          : await tx.query.gradeOverrides.findMany({
              where: eq(gradeOverrides.attemptId, attemptId),
              orderBy: asc(gradeOverrides.createdAt),
            }),
      };
    },
  );
  if (!attempt) throw ApiError.notFound('Attempt not found');

  const rows = overrideRows ?? storedRows;

  const { byQuestionId, wholeAttempt } = buildLatestOverrides(rows);

  const studentAnswers =
    attempt.answers && typeof attempt.answers === 'object'
      ? (attempt.answers as Record<string, unknown>)
      : {};
  const existingFeedback =
    attempt.gptFeedback && typeof attempt.gptFeedback === 'object'
      ? (attempt.gptFeedback as Record<string, unknown>)
      : {};

  const questionKeyMap = buildLegacyQuestionKeyMap(
    quizQuestions.map((question) => ({
      id: question.id,
      order: question.order,
      question: question.question,
      correctAnswer: question.correctAnswer,
    })),
    studentAnswers,
    existingFeedback,
  );

  let totalScore = 0;
  let maxScore = 0;
  const perQuestionScores: Record<string, number> = {};

  for (const question of quizQuestions) {
    const answerValue = resolveAttemptAnswer(
      question.id,
      studentAnswers,
      questionKeyMap,
    );
    const answerText =
      answerValue === undefined || answerValue === null
        ? ''
        : String(answerValue).trim();

    let questionScore = 0;
    maxScore += question.points;

    if (question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') {
      if (answerText && answerText === question.correctAnswer) {
        questionScore = question.points;
      }
    } else if (question.type === 'SHORT_ANSWER') {
      const feedback = resolveAttemptFeedback(
        question.id,
        existingFeedback,
        questionKeyMap,
      ) as StoredFeedback | undefined;

      if (feedback && typeof feedback.score === 'number') {
        questionScore = feedback.score;
      }
    }

    const override = byQuestionId.get(question.id);
    if (override) {
      if (override.numericScore != null) {
        questionScore = clampScore(override.numericScore, question.points);
      } else if (
        override.criteriaOverrides &&
        typeof override.criteriaOverrides === 'object' &&
        question.type === 'SHORT_ANSWER'
      ) {
        const feedback = resolveAttemptFeedback(
          question.id,
          existingFeedback,
          questionKeyMap,
        ) as StoredFeedback | undefined;
        const rubric = (question.rubric as RubricCriterion[] | null) ??
          feedback?.rubric ??
          [];
        const matches = mergeCriteriaMatches(
          feedback,
          override.criteriaOverrides as Record<string, boolean>,
        );
        questionScore = computeScoreFromRubric(
          rubric,
          matches,
          question.points,
          { requiredMatchCount: feedback?.requiredMatchCount },
        );
      }
    }

    perQuestionScores[question.id] = questionScore;
    totalScore += questionScore;
  }

  if (wholeAttempt?.numericScore != null) {
    totalScore = clampScore(wholeAttempt.numericScore, maxScore);
  }

  const { percentage, passed } = scoreOutcome({
    totalScore,
    maxScore,
    passingScore: attempt.quiz?.passingScore,
  });

  return {
    totalScore,
    maxScore,
    percentage,
    passed,
    perQuestionScores,
  };
}

export async function persistEffectiveAttemptScore(
  attemptId: string,
  overrideRows?: GradeOverrideRow[],
): Promise<EffectiveAttemptScore> {
  const effective = await computeEffectiveAttemptScore(attemptId, overrideRows);

  const { updateAttemptScoreDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  await updateAttemptScoreDefiner({
    attemptId,
    score: effective.totalScore,
    maxScore: effective.maxScore,
    percentage: effective.percentage,
    passed: effective.passed,
  });

  return effective;
}

export async function insertGradeOverride(
  input: GradeOverrideInput,
): Promise<{ override: GradeOverrideRow; effective: EffectiveAttemptScore }> {
  const note = input.note.trim();
  if (!note) {
    throw ApiError.badRequest('A note is required for grade overrides');
  }

  const hasNumeric =
    input.numericScore !== undefined && input.numericScore !== null;
  const hasCriteria =
    input.criteriaOverrides != null &&
    Object.keys(input.criteriaOverrides).length > 0;

  if (!hasNumeric && !hasCriteria) {
    throw ApiError.badRequest(
      'Provide numericScore and/or criteriaOverrides for the override',
    );
  }

  // FORCE RLS: a plain db read finds no attempt (every override returned
  // "Attempt not found"). Look it up via the definer.
  const attempt = await loadAttemptForGrading(input.attemptId);
  if (!attempt) throw ApiError.notFound('Attempt not found');
  if (!attempt.submittedAt) {
    throw ApiError.badRequest('Only submitted attempts can be overridden');
  }
  {
    const { requireWorkspaceTeaching, requireSectionTeaching } = await import(
      '@/lib/workspace/entitlement'
    );
    if (attempt.tenantId) {
      await requireWorkspaceTeaching(attempt.tenantId);
    } else if (attempt.sectionId) {
      await requireSectionTeaching(attempt.sectionId);
    }
  }

  if (!attempt.tenantId) {
    throw ApiError.badRequest('Attempt is missing tenant_id');
  }
  const tenantId = attempt.tenantId;
  const quizQs = await loadQuizQuestions(attempt.quizId, tenantId);

  if (input.questionId) {
    const question = quizQs.find((q) => q.id === input.questionId);
    if (!question || question.quizId !== attempt.quizId) {
      throw ApiError.badRequest('questionId does not belong to this attempt quiz');
    }
    if (hasNumeric && input.numericScore != null) {
      if (
        input.numericScore < 0 ||
        input.numericScore > question.points
      ) {
        throw ApiError.badRequest(
          `numericScore must be between 0 and ${question.points}`,
        );
      }
    }
  } else if (hasCriteria) {
    throw ApiError.badRequest(
      'criteriaOverrides require a questionId (per-question override)',
    );
  }

  const {
    insertGradeOverrideDefiner,
    listGradeOverridesDefiner,
  } = await import('@/lib/db/tenantWriteDefiners');
  const override = await insertGradeOverrideDefiner({
    attemptId: input.attemptId,
    tenantId,
    questionId: input.questionId ?? null,
    numericScore: hasNumeric ? input.numericScore! : null,
    criteriaOverrides: hasCriteria ? input.criteriaOverrides! : null,
    note,
    actorUserId: input.actorUserId,
  });

  // Few-shot moat: persist labeled example for this question.
  if (input.questionId) {
    try {
      const answers = (attempt.answers ?? {}) as Record<string, unknown>;
      const gptFeedback = (attempt.gptFeedback ?? {}) as Record<
        string,
        unknown
      >;
      const keyMap = buildLegacyQuestionKeyMap(quizQs, answers, gptFeedback);
      const answerText =
        resolveAttemptAnswer(input.questionId, answers, keyMap) ?? '';
      const feedback = resolveAttemptFeedback(
        input.questionId,
        gptFeedback as Record<string, StoredFeedback>,
        keyMap,
      );
      const { recordOverrideExample } = await import(
        '@/lib/grading/overrideExamples'
      );
      await recordOverrideExample({
        tenantId,
        questionId: input.questionId,
        rubricVersion: feedback?.rubricVersion ?? 1,
        studentAnswer: String(answerText),
        aiMatches: feedback?.rubricMatches ?? null,
        instructorCriteria: hasCriteria ? input.criteriaOverrides! : null,
        instructorScore: hasNumeric ? input.numericScore! : null,
        note,
      });
    } catch (err) {
      console.warn('[overrides] failed to record few-shot example', err);
    }
  }

  const allRows = await listGradeOverridesDefiner(input.attemptId);

  const effective = await persistEffectiveAttemptScore(
    input.attemptId,
    allRows as GradeOverrideRow[],
  );

  return { override: override as GradeOverrideRow, effective };
}

/** Override history for student display when grades are released. */
export async function listGradeOverrideHistoryForAttempt(
  attemptId: string,
): Promise<
  Array<{
    id: string;
    questionId: string | null;
    numericScore: number | null;
    criteriaOverrides: Record<string, boolean> | null;
    note: string;
    createdAt: Date;
  }>
> {
  // FORCE RLS: a plain db read returned no overrides, so students never saw
  // instructor notes. Callers check the student owns the attempt.
  const { listGradeOverridesDefiner } = await import('@/lib/db/tenantWriteDefiners');
  const rows = await listGradeOverridesDefiner(attemptId);
  return rows.map((r) => ({
    id: r.id,
    questionId: r.questionId,
    numericScore: r.numericScore,
    criteriaOverrides: r.criteriaOverrides ?? null,
    note: r.note,
    createdAt: r.createdAt,
  }));
}
