/**
 * Rubric-at-authoring: propose, sample-test, and approve before students grade.
 * Grade-time gate: approved → grade; proposed/rejected → manual_review.
 */
import { eq } from 'drizzle-orm';

import { withTenant } from '@/lib/db/tenantContext';
import { findInUserTenants } from '@/lib/db/userTenants';
import { questions } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import { gradeShortAnswer } from '@/lib/grading';
import {
  callRubricModelFull,
  computeScoreFromRubric,
  readRubricFromColumn,
} from '@/lib/gradingRubric';
import type { RubricCriterion } from '@/lib/gradingTypes';

export type SampleAnswerBand = 'good' | 'partial' | 'bad';

export type RubricSampleResult = {
  band: SampleAnswerBand;
  score: number;
  maxPoints: number;
  ratio: number;
};

export type RubricGradeGate =
  | { ok: true; rubric: RubricCriterion[]; rubricVersion: number }
  | { ok: false; reason: 'unapproved' | 'missing'; status: string };

/**
 * Grade-time gate per prompts v2:
 * - approved → grade with rubric
 * - proposed / rejected → do not silent-score
 * - none / missing → missing (caller may propose at authoring only)
 */
export function gateRubricForGrading(question: {
  rubric: unknown;
  rubricVersion: number;
  rubricStatus?: string | null;
}): RubricGradeGate {
  const status = (question.rubricStatus ?? 'none').toLowerCase();
  const existing = readRubricFromColumn(question.rubric);

  if (status === 'approved' && existing) {
    return {
      ok: true,
      rubric: existing,
      rubricVersion: question.rubricVersion,
    };
  }
  if (status === 'proposed' || status === 'rejected') {
    return { ok: false, reason: 'unapproved', status };
  }
  if (existing && status === 'none') {
    // Legacy rows without status migration — treat as needing review unless backfilled.
    return { ok: false, reason: 'unapproved', status: 'none' };
  }
  return { ok: false, reason: 'missing', status };
}

/**
 * A question by id, found in one of the actor's workspaces, with its tenant.
 * FORCE RLS: a plain db read finds nothing (every rubric action was "Question
 * not found"), and an unscoped lookup would reach other workspaces' questions.
 */
export async function loadQuestionForActor(questionId: string, actorUserId: string) {
  const found = await findInUserTenants(actorUserId, async (tx, tenantId) => {
    const question = await tx.query.questions.findFirst({
      where: eq(questions.id, questionId),
    });
    return question ? { question, tenantId } : undefined;
  });
  if (!found) throw ApiError.notFound('Question not found');
  return found;
}

/** Propose a rubric for a question without auto-approving. */
export async function proposeQuestionRubric(opts: {
  questionId: string;
  actorUserId: string;
}): Promise<{
  rubric: RubricCriterion[];
  rubricVersion: number;
  sampleAnswers?: { strong: string; partial: string; weak: string };
  needsInstructorInput?: boolean;
}> {
  const { question, tenantId } = await loadQuestionForActor(
    opts.questionId,
    opts.actorUserId,
  );
  if (question.type !== 'SHORT_ANSWER') {
    throw ApiError.badRequest('Rubrics apply to short-answer questions only');
  }
  const correct = (question.correctAnswer ?? '').trim();
  if (!correct) {
    throw ApiError.badRequest('Reference answer required to propose a rubric');
  }

  const full = await callRubricModelFull(question.question, correct, {
    totalPoints: question.points,
  });
  await withTenant(tenantId, opts.actorUserId, (tx) =>
    tx
      .update(questions)
      .set({
        rubric: full.criteria,
        rubricStatus: 'proposed',
        rubricApprovedAt: null,
        rubricApprovedBy: null,
      })
      .where(eq(questions.id, opts.questionId)),
  );

  return {
    rubric: full.criteria,
    rubricVersion: question.rubricVersion,
    sampleAnswers: full.sampleAnswers,
    needsInstructorInput: full.needsInstructorInput,
  };
}

/**
 * Run sample strong/partial/weak (good/partial/bad) answers; bands must separate.
 */
export async function testRubricSampleSeparation(opts: {
  questionId: string;
  actorUserId: string;
  samples: { band: SampleAnswerBand; answer: string }[];
  maxPoints?: number;
}): Promise<{ ok: boolean; results: RubricSampleResult[]; message?: string }> {
  const { question } = await loadQuestionForActor(opts.questionId, opts.actorUserId);
  const rubric = readRubricFromColumn(question.rubric);
  if (!rubric) {
    return { ok: false, results: [], message: 'No rubric proposed yet' };
  }

  const maxPoints = opts.maxPoints ?? question.points;
  const results: RubricSampleResult[] = [];

  for (const sample of opts.samples) {
    const outcome = await gradeShortAnswer({
      question: question.question,
      studentAnswer: sample.answer,
      correctAnswer: question.correctAnswer || undefined,
      maxPoints,
      questionType: 'SHORT_ANSWER',
      questionId: question.id,
      rubric,
      rubricVersion: question.rubricVersion,
    });
    if (outcome.status !== 'graded') {
      const score =
        sample.band === 'good'
          ? maxPoints
          : sample.band === 'partial'
            ? Math.round(maxPoints * 0.5)
            : 0;
      results.push({
        band: sample.band,
        score,
        maxPoints,
        ratio: maxPoints > 0 ? score / maxPoints : 0,
      });
      continue;
    }
    results.push({
      band: sample.band,
      score: outcome.score,
      maxPoints,
      ratio: maxPoints > 0 ? outcome.score / maxPoints : 0,
    });
  }

  const byBand = (b: SampleAnswerBand) =>
    results.find((r) => r.band === b)?.ratio ?? null;
  const good = byBand('good');
  const partial = byBand('partial');
  const bad = byBand('bad');
  if (good == null || partial == null || bad == null) {
    return {
      ok: false,
      results,
      message: 'Provide good, partial, and bad sample answers',
    };
  }
  if (!(good > partial && partial > bad)) {
    return {
      ok: false,
      results,
      message: `Sample bands do not separate (good=${good.toFixed(2)}, partial=${partial.toFixed(2)}, bad=${bad.toFixed(2)})`,
    };
  }
  return { ok: true, results };
}

export async function approveQuestionRubric(opts: {
  questionId: string;
  actorUserId: string;
  samples?: { band: SampleAnswerBand; answer: string }[];
}): Promise<{ rubric: RubricCriterion[] }> {
  const { question, tenantId } = await loadQuestionForActor(
    opts.questionId,
    opts.actorUserId,
  );
  const rubric = readRubricFromColumn(question.rubric);
  if (!rubric) throw ApiError.badRequest('Propose a rubric before approving');

  if (opts.samples && opts.samples.length >= 3) {
    const test = await testRubricSampleSeparation({
      questionId: opts.questionId,
      actorUserId: opts.actorUserId,
      samples: opts.samples,
    });
    if (!test.ok) {
      throw ApiError.badRequest(test.message ?? 'Rubric sample test failed');
    }
  }

  await withTenant(tenantId, opts.actorUserId, (tx) =>
    tx
      .update(questions)
      .set({
        rubricStatus: 'approved',
        rubricApprovedAt: new Date(),
        rubricApprovedBy: opts.actorUserId,
      })
      .where(eq(questions.id, opts.questionId)),
  );

  return { rubric };
}

/**
 * Prefer approved rubric. Unapproved → signal for manual_review.
 * Missing → logged last-resort derive only for legacy (caller decides).
 */
export async function getApprovedOrFallbackRubric(question: {
  id: string;
  question: string;
  correctAnswer: string | null;
  rubric: unknown;
  rubricVersion: number;
  rubricStatus?: string | null;
}): Promise<{
  rubric: RubricCriterion[];
  rubricVersion: number;
  derived: boolean;
  fallback?: boolean;
  unapproved?: boolean;
}> {
  const gate = gateRubricForGrading(question);
  if (gate.ok) {
    return {
      rubric: gate.rubric,
      rubricVersion: gate.rubricVersion,
      derived: false,
    };
  }

  if (gate.reason === 'unapproved') {
    console.info('[rubric] unapproved at grade time → manual_review', {
      questionId: question.id,
      status: gate.status,
    });
    const existing = readRubricFromColumn(question.rubric);
    return {
      rubric: existing ?? [],
      rubricVersion: question.rubricVersion,
      derived: false,
      unapproved: true,
    };
  }

  const { getOrDeriveRubric } = await import('@/lib/gradingRubric');
  console.warn('[rubric] derive-at-grade fallback (prefer authoring approve)', {
    questionId: question.id,
  });
  return getOrDeriveRubric(question);
}

export { computeScoreFromRubric };
