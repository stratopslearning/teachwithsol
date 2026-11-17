import { quizzes, sections } from '@/app/db/schema';
import { fetchAdminWorkspaceDirectory } from '@/lib/admin/platformReads';
import { activeOnly } from '@/lib/db/filters';
import { withTenant } from '@/lib/db/tenantContext';
import { partitionBySectionConclusion } from '@/lib/sections/availability';
import { listCoursesForWorkspace } from '@/lib/workspace/queries';

/**
 * Data for the admin quizzes page. With a workspace selected, its ongoing
 * sections, quizzes and assignments, read under that workspace. For "all",
 * quizzes from every workspace (sections were only ever shown for one).
 * FORCE RLS: plain db reads return nothing, so every read runs under a tenant.
 */
export async function loadAdminQuizzesPage(workspaceId: string | null) {
  const scoped = workspaceId
    ? await withTenant(workspaceId, null, async (tx) => ({
        sections: await tx.query.sections.findMany({
          where: activeOnly(sections.deletedAt),
          with: { course: true },
        }),
        quizzes: await tx.query.quizzes.findMany({
          where: activeOnly(quizzes.deletedAt),
        }),
        quizSections: await tx.query.quizSections.findMany(),
      }))
    : null;

  const workspaceCourses = workspaceId ? await listCoursesForWorkspace(workspaceId) : [];
  const courseIds = new Set(workspaceCourses.map((c) => c.id));
  const { active: ongoingSections } = partitionBySectionConclusion(
    (scoped?.sections ?? []).filter((s) => courseIds.has(s.courseId)),
  );

  const allQuizzes =
    scoped?.quizzes ??
    (
      await Promise.all(
        (await fetchAdminWorkspaceDirectory()).map((ws) =>
          withTenant(ws.id, null, (tx) =>
            tx.query.quizzes.findMany({ where: activeOnly(quizzes.deletedAt) }),
          ),
        ),
      )
    ).flat();

  const ongoingIds = new Set(ongoingSections.map((s) => s.id));
  const quizSectionLinks = (scoped?.quizSections ?? []).filter((qs) =>
    ongoingIds.has(qs.sectionId),
  );

  return { sections: ongoingSections, quizzes: allQuizzes, quizSections: quizSectionLinks };
}
