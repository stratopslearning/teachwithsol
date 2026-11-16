import { eq, sql } from 'drizzle-orm';

import { withQuizTenant } from '@/lib/db/sectionTenants';
import { attempts, quizVersions, quizzes } from '@/app/db/schema';
import { ApiError } from '@/lib/api/errors';
import type { QuizQuestionInput } from '@/lib/professor/mutations';

function normalizeQuestion(q: {
  type: string;
  question: string;
  options?: string[] | null;
  correctAnswer?: string | null;
  points: number;
  order: number;
}) {
  return JSON.stringify({
    type: q.type,
    question: q.question.trim(),
    options: q.options ?? [],
    correctAnswer: q.correctAnswer ?? '',
    points: q.points,
    order: q.order,
  });
}

export function quizQuestionsChanged(
  existing: Array<{
    type: string;
    question: string;
    options?: string[] | null;
    correctAnswer?: string | null;
    points: number;
    order: number;
  }>,
  incoming: QuizQuestionInput[],
): boolean {
  const a = [...existing]
    .sort((x, y) => x.order - y.order)
    .map(normalizeQuestion)
    .join('|');
  const b = [...incoming]
    .sort((x, y) => x.order - y.order)
    .map((q) =>
      normalizeQuestion({
        type: q.type,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points,
        order: q.order,
      }),
    )
    .join('|');
  return a !== b;
}

export async function quizQuestionEditsAreImmutable(quizId: string): Promise<{
  locked: boolean;
  reasons: string[];
}> {
  // FORCE RLS: plain db reads saw no versions or attempts, so questions were
  // never locked, even after students had answered them. Read under the
  // quiz's tenant.
  const [quiz, versionRow, attemptRow] =
    (await withQuizTenant(quizId, null, async (tx) => [
      await tx.query.quizzes.findFirst({
        where: eq(quizzes.id, quizId),
        columns: { gradesReleasedAt: true },
      }),
      await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(quizVersions)
        .where(eq(quizVersions.quizId, quizId)),
      await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(attempts)
        .where(eq(attempts.quizId, quizId)),
    ] as const)) ?? [undefined, [], []];

  const reasons: string[] = [];
  if ((versionRow[0]?.count ?? 0) > 0) reasons.push('published_versions');
  if (quiz?.gradesReleasedAt) reasons.push('grades_released');
  if ((attemptRow[0]?.count ?? 0) > 0) reasons.push('student_attempts');

  return { locked: reasons.length > 0, reasons };
}

/** Block in-place question edits on published quizzes; metadata edits still allowed. */
export async function assertQuizQuestionsEditable(
  quizId: string,
  existingQuestions: Array<{
    type: string;
    question: string;
    options?: string[] | null;
    correctAnswer?: string | null;
    points: number;
    order: number;
  }>,
  incoming: QuizQuestionInput[],
): Promise<void> {
  if (!quizQuestionsChanged(existingQuestions, incoming)) return;

  const { locked } = await quizQuestionEditsAreImmutable(quizId);
  if (!locked) return;

  throw ApiError.conflict(
    'This quiz has published versions, released grades, or student attempts. Duplicate the quiz or create a new version to change questions.',
  );
}
