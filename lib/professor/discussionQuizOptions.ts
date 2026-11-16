import { eq, inArray } from 'drizzle-orm';

import { quizSections, quizzes } from '@/app/db/schema';
import { groupSectionIdsByTenant } from '@/lib/db/sectionTenants';
import { withTenant } from '@/lib/db/tenantContext';
import { readInUserTenants } from '@/lib/db/userTenants';

export type QuizOption = { id: string; title: string; description: string | null };

/**
 * Quizzes a teacher can link a discussion to: their own quizzes plus quizzes
 * assigned to the given sections, excluding deleted ones.
 *
 * FORCE RLS: plain db reads returned nothing, so the quiz picker was empty.
 * Reads run under each of the teacher's tenants / each section's tenant.
 */
export async function listDiscussionQuizOptions(
  userId: string,
  sectionIds: string[],
): Promise<Map<string, QuizOption>> {
  const owned = await readInUserTenants(userId, (tx) =>
    tx.query.quizzes.findMany({ where: eq(quizzes.professorId, userId) }),
  );
  const byTenant = await groupSectionIdsByTenant(sectionIds);
  const linked = (
    await Promise.all(
      [...byTenant].map(([tenantId, ids]) =>
        withTenant(tenantId, userId, (tx) =>
          tx.query.quizSections.findMany({
            where: inArray(quizSections.sectionId, ids),
            with: { quiz: true },
          }),
        ),
      ),
    )
  )
    .flat()
    .map((link) => link.quiz);

  const options = new Map<string, QuizOption>();
  for (const q of [...owned, ...linked]) {
    if (q && !q.deletedAt) {
      options.set(q.id, { id: q.id, title: q.title, description: q.description });
    }
  }
  return options;
}
