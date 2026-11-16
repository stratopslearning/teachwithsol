import Link from 'next/link';
import { ArrowRight, Layers } from '@/components/icons';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { appPath } from '@/lib/basePath';
import {
  getDashboardAreas,
  requireTeachingAccess,
} from '@/lib/authz/gates';
import { appRedirect } from '@/lib/serverRedirect';
import {
  getActiveWorkspaceId,
  listActiveMembershipsForUser,
} from '@/lib/workspace';
import { fetchWorkspaceCoursesWithSections } from '@/lib/workspace/workspaceScopedReads';

export const dynamic = 'force-dynamic';

async function countCoursesInWorkspace(workspaceId: string): Promise<number> {
  const rows = await fetchWorkspaceCoursesWithSections(workspaceId);
  return rows.length;
}

export default async function DashboardHomePage() {
  const user = await requireTeachingAccess();
  const areas = await getDashboardAreas(user);
  if (areas.platformStaff) appRedirect('/dashboard/admin');

  const memberships = await listActiveMembershipsForUser(user.id);
  if (memberships.length <= 1 && !areas.learning) {
    appRedirect('/dashboard/professor');
  }

  const activeWorkspaceId = await getActiveWorkspaceId(user.id);
  const switcherOptions = memberships
    .filter((m) => m.workspace)
    .map((m) => ({ id: m.workspace!.id, name: m.workspace!.name }));
  const active =
    switcherOptions.find((o) => o.id === activeWorkspaceId) ?? switcherOptions[0];

  const courseCounts = await Promise.all(
    memberships.map(async (m) => {
      if (!m.workspace) return { membershipId: m.id, courseCount: 0 };
      const courseCount = await countCoursesInWorkspace(m.workspace.id);
      return { membershipId: m.id, courseCount };
    }),
  );
  const countByMembership = new Map(
    courseCounts.map((c) => [c.membershipId, c.courseCount]),
  );

  return (
    <AppShell
      role="professor"
      active="workspace"
      topbarTitle="Home"
      topbarActions={
        active ? (
          <WorkspaceSwitcher
            memberships={switcherOptions}
            activeWorkspaceId={active.id}
          />
        ) : null
      }
    >
      <PageHeader
        breadcrumbs={[{ label: 'Home' }]}
        eyebrow="Workspaces"
        title="Your memberships"
        description="Switch active workspace, then open your desk or workspace settings."
      />

      <ul className="mt-8 flex flex-col gap-3">
        {memberships.map((m) => {
          if (!m.workspace) return null;
          const license = m.workspace.licenses?.[0];
          const courseCount = countByMembership.get(m.id) ?? 0;
          return (
            <li
              key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-4"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-rule bg-surface-sunken text-brand">
                  <Layers className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{m.workspace.name}</p>
                  <p className="text-xs text-ink-muted">
                    {m.role} · {m.workspace.type}
                    {license ? ` · ${license.plan}` : ''}
                    {` · ${courseCount} course${courseCount === 1 ? '' : 's'}`}
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={appPath('/dashboard/professor')}>
                  Open desk
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              </Button>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-sm text-ink-muted">
        Need another workspace?{' '}
        <Link href={appPath('/onboarding')} className="text-brand hover:underline">
          Start onboarding
        </Link>
      </p>
    </AppShell>
  );
}
