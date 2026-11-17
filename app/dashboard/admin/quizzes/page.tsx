import { AppShell } from "@/components/layout/AppShell";
import { requireAdmin } from "@/lib/auth";
import { loadAdminQuizzesPage } from "@/lib/data/pages/adminQuizzes";
import { resolveWorkspaceScopeParam } from "@/lib/workspace/queries";

import AdminQuizzesPageClient from "./AdminQuizzesPageClient";

export default async function AdminQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const scope = resolveWorkspaceScopeParam(params.workspaceId);
  const data = await loadAdminQuizzesPage(scope === 'all' ? null : scope);

  return (
    <AppShell role="admin" active="workspaces" topbarTitle="Assignments">
      <AdminQuizzesPageClient
        allSections={data.sections}
        allQuizzes={data.quizzes}
        allQuizSections={data.quizSections}
      />
    </AppShell>
  );
}
