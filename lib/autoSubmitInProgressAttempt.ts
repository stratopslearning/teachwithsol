import {
  executeQuizSubmit,
  MaxAttemptsExceededError,
} from '@/lib/executeQuizSubmit';
import { fetchAttemptWithQuizAssignmentDefiner } from '@/lib/db/studentWriteDefiners';
import { shouldForceAutoSubmitInProgress } from '@/lib/shouldForceAutoSubmit';

export type AutoSubmitAttemptResult =
  | { submitted: true; attemptId: string; reason: string }
  | { submitted: false; reason: 'not_found' | 'already_submitted' | 'not_due' | 'max_attempts' };

/**
 * Finalize a single in-progress attempt when the timer or due date requires it.
 */
export async function autoSubmitInProgressAttempt(
  attemptId: string,
  now: Date = new Date(),
): Promise<AutoSubmitAttemptResult> {
  const packed = await fetchAttemptWithQuizAssignmentDefiner(attemptId);
  const row = packed?.attempt;
  if (!row || row.submittedAt) {
    return {
      submitted: false,
      reason: row ? 'already_submitted' : 'not_found',
    };
  }

  const quiz = packed?.quiz;
  const assignment = packed?.assignment;
  if (!quiz || !assignment) {
    return { submitted: false, reason: 'not_found' };
  }

  const startedAt =
    row.startedAt instanceof Date ? row.startedAt : new Date(row.startedAt);

  const { force, reason } = shouldForceAutoSubmitInProgress({
    quiz,
    assignment,
    startedAt,
    now,
  });
  if (!force) {
    return { submitted: false, reason: 'not_due' };
  }

  const savedAnswers =
    row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)
      ? (row.answers as Record<string, string>)
      : {};

  try {
    const result = await executeQuizSubmit({
      quizId: row.quizId,
      assignmentId: row.assignmentId,
      studentId: row.studentId,
      answers: savedAnswers,
      autoSubmitted: true,
      bypassAvailability: true,
    });
    return {
      submitted: true,
      attemptId: result.attemptId,
      reason: reason ?? 'timer',
    };
  } catch (error) {
    if (error instanceof MaxAttemptsExceededError) {
      return { submitted: false, reason: 'max_attempts' };
    }
    console.error('[autoSubmitInProgressAttempt] failed', attemptId, error);
    throw error;
  }
}

const SWEEP_BATCH = 40;

/**
 * Server-side safety net: finalize in-progress attempts past timer or due date.
 * Sweep still uses a limited DEFINER-backed fetch per candidate via autoSubmit.
 */
export async function sweepStaleInProgressAttempts(
  now: Date = new Date(),
): Promise<{ scanned: number; submitted: number; results: AutoSubmitAttemptResult[] }> {
  const { db } = await import('@/app/db');
  const { sql } = await import('drizzle-orm');
  const result = await db.execute(sql`
    SELECT sol_list_open_attempt_ids(${SWEEP_BATCH * 3}::int) AS ids
  `);
  const raw =
    (result as { rows?: Array<{ ids: unknown }> }).rows?.[0]?.ids ??
    (Array.isArray(result)
      ? (result as Array<{ ids: unknown }>)[0]?.ids
      : null);
  const ids = Array.isArray(raw) ? raw.map((id) => String(id)) : [];

  const results: AutoSubmitAttemptResult[] = [];
  let submitted = 0;

  for (const id of ids) {
    if (results.length >= SWEEP_BATCH) break;
    const packed = await fetchAttemptWithQuizAssignmentDefiner(id);
    if (!packed?.attempt || !packed.quiz || !packed.assignment) continue;
    if (packed.quiz.deletedAt) continue;

    const startedAt =
      packed.attempt.startedAt instanceof Date
        ? packed.attempt.startedAt
        : new Date(packed.attempt.startedAt);
    const { force } = shouldForceAutoSubmitInProgress({
      quiz: packed.quiz,
      assignment: packed.assignment,
      startedAt,
      now,
    });
    if (!force) continue;

    const outcome = await autoSubmitInProgressAttempt(id, now);
    results.push(outcome);
    if (outcome.submitted) submitted += 1;
  }

  return { scanned: ids.length, submitted, results };
}
