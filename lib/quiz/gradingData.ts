/**
 * Reads and writes for quiz grading that work under FORCE RLS.
 *
 * questions / quizzes / attempts are tenant-scoped. A plain `db` read with no
 * tenant set returns no rows, and a plain update matches no rows, silently.
 * That scored submissions against zero questions (score 0/0) and dropped
 * background grading / regrade results. Everything here runs under the
 * attempt's tenant (withTenant) or through a SECURITY DEFINER function.
 */
import { and, eq } from 'drizzle-orm';

import { attempts, questions, quizzes } from '@/app/db/schema';
import { activeOnly } from '@/lib/db/filters';
import { fetchAttemptWithQuizAssignmentDefiner } from '@/lib/db/studentWriteDefiners';
import { withTenant } from '@/lib/db/tenantContext';

export type GradingQuestion = typeof questions.$inferSelect;
export type GradingQuiz = typeof quizzes.$inferSelect;
type AttemptRow = typeof attempts.$inferSelect;

/** All questions of a quiz, read under its tenant. */
export async function loadQuizQuestions(
  quizId: string,
  tenantId: string,
): Promise<GradingQuestion[]> {
  return withTenant(tenantId, null, (tx) =>
    tx.query.questions.findMany({
      where: eq(questions.quizId, quizId),
      orderBy: (q, { asc }) => asc(q.order),
    }),
  );
}

/** A non-deleted quiz, read under its tenant. */
export async function loadActiveQuiz(
  quizId: string,
  tenantId: string,
): Promise<GradingQuiz | undefined> {
  return withTenant(tenantId, null, (tx) =>
    tx.query.quizzes.findFirst({
      where: and(eq(quizzes.id, quizId), activeOnly(quizzes.deletedAt)),
    }),
  );
}

/** An attempt by id with its tenant, via a SECURITY DEFINER lookup. */
export async function loadAttemptForGrading(attemptId: string): Promise<AttemptRow | null> {
  const bundle = await fetchAttemptWithQuizAssignmentDefiner(attemptId);
  return bundle?.attempt ?? null;
}

/**
 * A student's own attempt with its quiz, for the results / review pages.
 * The lookup bypasses RLS, so ownership is checked here: returns null unless
 * the attempt belongs to `studentId`.
 */
export async function loadOwnAttempt(
  attemptId: string,
  studentId: string,
): Promise<{ attempt: AttemptRow; quiz: GradingQuiz } | null> {
  const bundle = await fetchAttemptWithQuizAssignmentDefiner(attemptId);
  if (!bundle?.attempt || !bundle.quiz) return null;
  if (bundle.attempt.studentId !== studentId) return null;
  return { attempt: bundle.attempt, quiz: bundle.quiz };
}

/**
 * Persist grading results for one attempt under its tenant. Throws if no row
 * was updated, so a lost write can't pass silently again.
 */
export async function saveAttemptGrading(
  tenantId: string,
  attemptId: string,
  fields: Partial<
    Pick<
      AttemptRow,
      'score' | 'maxScore' | 'percentage' | 'passed' | 'gptFeedback' | 'gradingStatus'
    >
  >,
): Promise<void> {
  const updated = await withTenant(tenantId, null, (tx) =>
    tx
      .update(attempts)
      .set(fields)
      .where(eq(attempts.id, attemptId))
      .returning({ id: attempts.id }),
  );
  if (updated.length !== 1) {
    throw new Error(`Grading result for attempt ${attemptId} was not saved`);
  }
}
