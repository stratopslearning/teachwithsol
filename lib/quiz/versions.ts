import { desc, eq } from 'drizzle-orm';

import { withQuizTenant } from '@/lib/db/sectionTenants';
import { quizVersions, quizzes, questions } from '@/app/db/schema';

export type QuizVersionSnapshot = {
  quiz: typeof quizzes.$inferSelect;
  questions: Array<typeof questions.$inferSelect>;
  capturedAt: string;
};

/** Immutable quiz snapshot row (version increments per quiz). */
export async function createQuizVersionSnapshot(opts: {
  quizId: string;
  createdByUserId?: string | null;
}): Promise<{ id: string; version: number }> {
  // FORCE RLS: bare quiz/questions/version reads fail without tenant GUC.
  const { createQuizVersionSnapshotDefiner } = await import(
    '@/lib/db/entityScopedReads'
  );
  return createQuizVersionSnapshotDefiner({
    quizId: opts.quizId,
    createdByUserId: opts.createdByUserId ?? null,
  });
}

export async function getLatestQuizVersionId(
  quizId: string,
): Promise<string | null> {
  // FORCE RLS: a plain db read returned nothing, so attempts never recorded
  // their quiz version. Read under the quiz's tenant.
  const row = await withQuizTenant(quizId, null, (tx) =>
    tx.query.quizVersions.findFirst({
      where: eq(quizVersions.quizId, quizId),
      orderBy: [desc(quizVersions.version)],
      columns: { id: true },
    }),
  );
  return row?.id ?? null;
}
