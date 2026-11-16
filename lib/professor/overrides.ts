/**
 * Instructor grade overrides: insert rows and recompute attempt totals from
 * the latest override per question (plus optional whole-attempt override).
 */
import { asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  attempts,
  gradeOverrides,
  questions,
  type gradeOverrides as gradeOverridesTable,
} from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { computeScoreFromRubric } from '@/lib/gradingRubric';
import type { RubricCriterion, StoredFeedback } from '@/lib/gradingTypes';
import {
  buildLegacyQuestionKeyMap,
  resolveAttemptAnswer,
  resolveAttemptFeedback,
} from '@/lib/quizAttemptAnswers';
import { DEFAULT_PASSING_SCORE } from '@/lib/quizSchemas';

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
  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, attemptId),
    with: { quiz: { columns: { passingScore: true } } },
  });
  if (!attempt) throw ApiError.notFound('Attempt not found');

  const quizQuestions = await db.query.questions.findMany({
    where: eq(questions.quizId, attempt.quizId),
    orderBy: (q, { asc: ascOp }) => ascOp(q.order),
  });

  const rows =
    overrideRows ??
    (await db.query.gradeOverrides.findMany({
      where: eq(gradeOverrides.attemptId, attemptId),
      orderBy: asc(gradeOverrides.createdAt),
    }));

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

  const percentage =
    maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;
  const passingScore = attempt.quiz?.passingScore ?? DEFAULT_PASSING_SCORE;
  const passed = maxScore > 0 ? percentage >= passingScore : false;

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

  const attempt = await db.query.attempts.findFirst({
    where: eq(attempts.id, input.attemptId),
    columns: {
      id: true,
      submittedAt: true,
      quizId: true,
      tenantId: true,
      sectionId: true,
    },
  });
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

  if (input.questionId) {
    const question = await db.query.questions.findFirst({
      where: eq(questions.id, input.questionId),
      columns: { id: true, quizId: true, points: true },
    });
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

  if (!attempt.tenantId) {
    throw ApiError.badRequest('Attempt is missing tenant_id');
  }

  const {
    insertGradeOverrideDefiner,
    listGradeOverridesDefiner,
  } = await import('@/lib/db/tenantWriteDefiners');
  const override = await insertGradeOverrideDefiner({
    attemptId: input.attemptId,
    tenantId: attempt.tenantId,
    questionId: input.questionId ?? null,
    numericScore: hasNumeric ? input.numericScore! : null,
    criteriaOverrides: hasCriteria ? input.criteriaOverrides! : null,
    note,
    actorUserId: input.actorUserId,
  });

  // Few-shot moat: persist labeled example for this question.
  if (input.questionId) {
    try {
      const fullAttempt = await db.query.attempts.findFirst({
        where: eq(attempts.id, input.attemptId),
        columns: { answers: true, gptFeedback: true },
      });
      const answers = (fullAttempt?.answers ?? {}) as Record<string, unknown>;
      const gptFeedback = (fullAttempt?.gptFeedback ?? {}) as Record<
        string,
        unknown
      >;
      const quizQs = await db.query.questions.findMany({
        where: eq(questions.quizId, attempt.quizId),
        columns: { id: true, order: true, question: true },
      });
      const keyMap = buildLegacyQuestionKeyMap(quizQs, answers, gptFeedback);
      const answerText =
        resolveAttemptAnswer(input.questionId, answers, keyMap) ?? '';
      const feedback = resolveAttemptFeedback(
        input.questionId,
        gptFeedback as Record<string, StoredFeedback>,
        keyMap,
      );
      const { recordOverrideExample } = await import(
        '@/lib/gradingOverrideExamples'
      );
      await recordOverrideExample({
        tenantId: attempt.tenantId,
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

export async function listAttemptIdsWithGradeOverrides(
  attemptIds: string[],
): Promise<Set<string>> {
  if (attemptIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ attemptId: gradeOverrides.attemptId })
    .from(gradeOverrides)
    .where(inArray(gradeOverrides.attemptId, attemptIds));
  return new Set(rows.map((r) => r.attemptId));
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
  const rows = await db.query.gradeOverrides.findMany({
    where: eq(gradeOverrides.attemptId, attemptId),
    orderBy: asc(gradeOverrides.createdAt),
    columns: {
      id: true,
      questionId: true,
      numericScore: true,
      criteriaOverrides: true,
      note: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    criteriaOverrides: r.criteriaOverrides ?? null,
  }));
}
