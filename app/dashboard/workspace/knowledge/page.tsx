import Link from 'next/link';
import { ArrowRight } from '@/components/icons';

import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import KnowledgeClient from '@/app/dashboard/workspace/knowledge/KnowledgeClient';
import { CourseSwitcher } from '@/components/professor/CourseSwitcher';
import { Button } from '@/components/ui/button';
import { withBasePath, appPath } from '@/lib/basePath';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { listCourseBooks } from '@/lib/books';
import {
  listConnectorProviderStatus,
  listTeachableCourses,
  listWorkspaceConnectors,
  listWorkspaceDocuments,
} from '@/lib/knowledge';
import {
  getActiveCourseIdFromList,
  resolveProfessorCourseIdFromList,
} from '@/lib/professor/activeCourse';
import { appRedirect } from '@/lib/serverRedirect';
import { TeachingPaywallBanner } from '@/components/workspace/TeachingPaywallBanner';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import {
  assertWorkspaceAllowsTeaching,
  getActiveWorkspaceId,
  listActiveMembershipsForUser,
} from '@/lib/workspace';

export const dynamic = 'force-dynamic';

export default async function WorkspaceKnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{
    tab?: string;
    workspaceId?: string;
    courseId?: string;
  }>;
}) {
  const user = await requireTeachingAccess();

  const params = await searchParams;
  const memberships = await listActiveMembershipsForUser(user.id);
  const activeWorkspaceId = await getActiveWorkspaceId(user.id);
  const primary =
    memberships.find((m) => m.workspaceId === activeWorkspaceId) ??
    memberships[0];
  if (!primary?.workspace) {
    appRedirect('/dashboard/workspace');
  }

  const workspaceId =
    params.workspaceId &&
    memberships.some((m) => m.workspaceId === params.workspaceId)
      ? params.workspaceId
      : primary!.workspace.id;

  const switcherOptions = memberships
    .filter((m) => m.workspace)
    .map((m) => ({ id: m.workspace!.id, name: m.workspace!.name }));
  const workspaceSwitcher =
    switcherOptions.length > 1 ? (
      <WorkspaceSwitcher
        memberships={switcherOptions}
        activeWorkspaceId={workspaceId}
      />
    ) : null;

  const teachable = await listTeachableCourses(user);
  const courseResolved = await resolveProfessorCourseIdFromList(
    teachable,
    params.courseId,
  );
  const activeCourseId = courseResolved.ok
    ? courseResolved.courseId
    : courseResolved.code === 'forbidden'
      ? await getActiveCourseIdFromList(teachable)
      : null;
  const activeCourse = teachable.find((c) => c.id === activeCourseId) ?? null;

  const courseHrefTemplate =
    params.tab === 'connections'
      ? '/dashboard/workspace/knowledge?courseId={courseId}&tab=connections'
      : '/dashboard/workspace/knowledge?courseId={courseId}';
  const courseSwitcher =
    teachable.length > 0 && activeCourseId ? (
      <CourseSwitcher
        courses={teachable.map((c) => ({ id: c.id, title: c.title }))}
        activeCourseId={activeCourseId}
        hrefTemplate={courseHrefTemplate}
      />
    ) : null;

  const [documents, connectors, books, entitlement] = await Promise.all([
    listWorkspaceDocuments(user, workspaceId).catch((err) => {
      console.warn('[knowledge] workspace documents list failed', err);
      return [];
    }),
    listWorkspaceConnectors(user, workspaceId).catch((err) => {
      console.warn('[knowledge] workspace connectors list failed', err);
      return [];
    }),
    activeCourseId
      ? listCourseBooks(user, activeCourseId).catch((err) => {
          console.warn('[knowledge] course books list failed', err);
          return [];
        })
      : Promise.resolve([]),
    assertWorkspaceAllowsTeaching(workspaceId),
  ]);
  const teachingBlocked =
    !entitlement.ok && entitlement.code === 'billing_required';
  const providers = listConnectorProviderStatus();

  const initialTab =
    params.tab === 'connections' ? 'connections' : 'library';

  const topbarActions =
    workspaceSwitcher || courseSwitcher ? (
      <div className="flex max-w-[min(100%,28rem)] items-center gap-1.5">
        {workspaceSwitcher}
        {courseSwitcher}
      </div>
    ) : null;

  return (
    <AppShell
      role="professor"
      active="knowledge"
      topbarTitle="Knowledge"
      topbarActions={topbarActions}
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
          { label: 'Workspace', href: withBasePath('/dashboard/workspace') },
          { label: 'Knowledge' },
        ]}
        eyebrow="Shared library"
        title="Knowledge"
        description="Workspace documents version and sync from Drive, OneDrive, SharePoint, Notion, and Confluence. Attach them to courses for tutor and authoring RAG."
        actions={
          activeCourse ? (
            <Button asChild variant="outline" size="sm">
              <Link
                href={appPath(
                  `/dashboard/professor/materials/${activeCourse.id}`,
                )}
              >
                Course materials
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          ) : teachable.length > 0 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={appPath('/dashboard/professor/materials')}>
                Course materials
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </Button>
          ) : null
        }
      />
      {activeCourse ? (
        <p className="mt-4 text-sm text-ink-muted">
          Active course:{' '}
          <span className="font-medium text-ink">{activeCourse.title}</span>
          {' · '}
          <Link
            href={appPath(`/dashboard/professor/materials/${activeCourse.id}`)}
            className="text-brand underline-offset-2 hover:underline"
          >
            Manage uploads &amp; attachments
          </Link>
        </p>
      ) : null}
      {teachingBlocked && !entitlement.ok ? (
        <div className="mt-4">
          <TeachingPaywallBanner
            workspaceId={workspaceId}
            reason={entitlement.reason}
          />
        </div>
      ) : null}
      <KnowledgeClient
        workspaceId={workspaceId}
        activeCourseId={activeCourseId}
        activeCourseTitle={activeCourse?.title ?? null}
        initialDocuments={documents}
        initialBooks={books}
        initialConnectors={connectors}
        initialProviders={providers}
        initialTab={initialTab}
        teachingBlocked={teachingBlocked}
      />
    </AppShell>
  );
}
