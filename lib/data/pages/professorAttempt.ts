import { asc, eq } from 'drizzle-orm';

import { attempts, gradeOverrides, questions } from '@/app/db/schema';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { withTenant } from '@/lib/db/tenantContext';
import type { UserData } from '@/lib/getOrCreateUser';
import { loadAttemptForGrading } from '@/lib/quiz/gradingData';

/**
 * One attempt for the professor attempt page, with its student, quiz
 * questions, section and override history. Returns null when the attempt
 * doesn't exist or the viewer can't grade / read its section.
 *
 * FORCE RLS: the attempt's tenant comes from a SECURITY DEFINER lookup and
 * the reads run under it.
 */
export async function loadProfessorAttemptPage(
  attemptId: string,
  user: Pick<UserData, 'id'> & { platformStaff?: boolean | null },
) {
  const found = await loadAttemptForGrading(attemptId);
  if (!found?.tenantId) return null;

  // Binding-based: grade.write or content.read on the attempt's section.
  if (
    !(await authorizeOnSection(user, 'grade.write', found.sectionId)) &&
    !(await authorizeOnSection(user, 'content.read', found.sectionId))
  ) {
    return null;
  }

  const { attempt, overrideRows } = await withTenant(found.tenantId, user.id, async (tx) => ({
    attempt: await tx.query.attempts.findFirst({
      where: eq(attempts.id, attemptId),
      with: {
        student: true,
        quiz: { with: { questions: { orderBy: questions.order } } },
        section: { with: { course: true } },
      },
    }),
    overrideRows: await tx.query.gradeOverrides.findMany({
      where: eq(gradeOverrides.attemptId, attemptId),
      orderBy: asc(gradeOverrides.createdAt),
      with: {
        actor: {
          columns: { firstName: true, lastName: true, email: true },
        },
      },
    }),
  }));
  return attempt ? { attempt, overrideRows } : null;
}
