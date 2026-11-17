import { and, eq, inArray } from 'drizzle-orm';

import { questions, quizSections, quizzes, sections } from '@/app/db/schema';
import { activeOnly } from '@/lib/db/filters';
import { readBySectionTenants, withQuizTenant } from '@/lib/db/sectionTenants';

// Page data for the professor quiz pages. FORCE RLS: plain db reads return
// nothing, so reads run under the quiz's tenant or each section's tenant.

/** Quiz assignments across the given sections, newest first. */
export async function loadQuizAssignmentsForSections(sectionIds: string[], userId: string) {
  const quizAssignmentRows = await readBySectionTenants(
    sectionIds,
    userId,
    (tx, ids) =>
      tx.query.quizSections.findMany({
        where: inArray(quizSections.sectionId, ids),
        with: {
          quiz: {
            columns: {
              id: true,
              title: true,
              description: true,
              isActive: true,
              professorId: true,
              deletedAt: true,
            },
            with: {
              professor: {
                columns: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
          section: { with: { course: { columns: { id: true, title: true } } } },
        },
        orderBy: (quizSections, { desc }) => desc(quizSections.assignedAt),
      }),
  );
  return quizAssignmentRows.sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
  );
}

/** Sections the teacher teaches, and the (non-deleted) quiz with its questions. */
export async function loadQuizEditPage(quizId: string, teachingIds: string[], userId: string) {
  const teachingSections = await readBySectionTenants(teachingIds, userId, (tx, ids) =>
    tx.query.sections.findMany({
      where: inArray(sections.id, ids),
      with: { course: true },
    }),
  );

  const quiz = await withQuizTenant(quizId, userId, (tx) =>
    tx.query.quizzes.findFirst({
      where: and(
        eq(quizzes.id, quizId),
        activeOnly(quizzes.deletedAt),
      ),
      with: {
        professor: true,
        questions: { orderBy: questions.order },
        sectionAssignments: {
          with: { section: { with: { course: true } } },
        },
      },
    }),
  );
  return { teachingSections, quiz };
}

/** The quiz's assignment to one of the given sections, with the quiz and its questions. */
export async function loadQuizResultsAssignment(
  quizId: string,
  enrolledSectionIds: string[],
  userId: string,
) {
  return withQuizTenant(quizId, userId, (tx) =>
    tx.query.quizSections.findFirst({
      where: and(
        eq(quizSections.quizId, quizId),
        inArray(quizSections.sectionId, enrolledSectionIds),
      ),
      with: {
        quiz: {
          with: {
            professor: true,
            questions: { orderBy: questions.order },
            sectionAssignments: {
              with: { section: { with: { course: true } } },
            },
          },
        },
      },
    }),
  );
}
