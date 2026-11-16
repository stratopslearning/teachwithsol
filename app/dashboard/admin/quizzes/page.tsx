import { fetchAdminWorkspaceDirectory } from "@/lib/admin/platformReads";
import { withTenant } from "@/lib/db/tenantContext";
import { quizzes, sections } from "@/app/db/schema";
import { AppShell } from "@/components/layout/AppShell";
import { activeOnly } from "@/lib/db/filters";
import { requireAdmin } from "@/lib/auth";
import { partitionBySectionConclusion } from "@/lib/sectionAvailability";
import { listCoursesForWorkspace, resolveWorkspaceScopeParam } from "@/lib/workspace/queries";

import AdminQuizzesPageClient from "./AdminQuizzesPageClient";

export default async function AdminQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const scope = resolveWorkspaceScopeParam(params.workspaceId);
  const workspaceScope = scope === 'all' ? null : scope;
  // FORCE RLS: plain db reads return nothing. With a workspace selected,
  // read it under that workspace; for "all", list quizzes per workspace
  // (sections were only ever shown for a selected workspace).
  const scoped = workspaceScope
    ? await withTenant(workspaceScope, null, async (tx) => ({
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
  const workspaceCourses = workspaceScope
    ? await listCoursesForWorkspace(workspaceScope)
    : [];
  const courseIds = new Set(workspaceCourses.map((c) => c.id));
  const allSectionsRaw = (scoped?.sections ?? []).filter((s) =>
    courseIds.has(s.courseId),
  );
  const { active: ongoingSections } =
    partitionBySectionConclusion(allSectionsRaw);
  const allQuizzesRaw =
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
  const allQuizSections = (scoped?.quizSections ?? []).filter((qs) =>
    ongoingIds.has(qs.sectionId),
  );

  return (
    <AppShell role="admin" active="workspaces" topbarTitle="Assignments">
      <AdminQuizzesPageClient
        allSections={ongoingSections}
        allQuizzes={allQuizzesRaw}
        allQuizSections={allQuizSections}
      />
    </AppShell>
  );
}
