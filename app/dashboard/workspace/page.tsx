import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { ArrowUpRight, BookOpen, CreditCard, Users } from '@/components/icons';

import { CreateCourseForm } from '@/app/dashboard/workspace/CreateCourseForm';
import { AccessRequestsPanel } from '@/app/dashboard/workspace/AccessRequestsPanel';
import { InviteFacultyForm } from '@/app/dashboard/workspace/InviteFacultyForm';
import { WorkspaceCourseList } from '@/app/dashboard/workspace/WorkspaceCourseList';
import { FacultyCsvImportForm } from '@/components/workspace/FacultyCsvImportForm';
import { TransferOwnershipForm } from '@/components/workspace/TransferOwnershipForm';
import { listPendingAccessRequests } from '@/lib/workspace/accessRequests';
import { authorize } from '@/lib/authz/authorize';
import { WorkspaceBillingButton } from '@/app/dashboard/workspace/WorkspaceBillingButton';
import { WorkspaceExportButton } from '@/app/dashboard/workspace/WorkspaceExportButton';
import {
  RemoveMemberButton,
  RevokeInviteButton,
} from '@/app/dashboard/workspace/WorkspaceTeamActions';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/patterns/EmptyState';
import { StatCard } from '@/components/patterns/StatCard';
import { LocalDateTime } from '@/components/timezone/LocalDateTime';
import { Button } from '@/components/ui/button';
import { appPath, withBasePath } from '@/lib/basePath';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { TeachingPaywallBanner } from '@/components/workspace/TeachingPaywallBanner';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import {
  assertWorkspaceAllowsCourseCreate,
  getActiveWorkspaceId,
  licenseHasOpenCompWindow,
  listActiveMembershipsForUser,
  userCanInviteWorkspaceFaculty,
} from '@/lib/workspace';
import {
  fetchWorkspaceActiveLearnerCount,
  fetchWorkspaceCoursesWithSections,
} from '@/lib/workspace/workspaceScopedReads';

export const dynamic = 'force-dynamic';

export default async function WorkspaceOwnerPage() {
  const user = await requireTeachingAccess();

  const memberships = await listActiveMembershipsForUser(user.id);
  const activeWorkspaceId = await getActiveWorkspaceId(user.id);
  const primary =
    memberships.find((m) => m.workspaceId === activeWorkspaceId) ?? memberships[0];
  const switcherOptions = memberships
    .filter((m) => m.workspace)
    .map((m) => ({ id: m.workspace!.id, name: m.workspace!.name }));
  const switcher =
    switcherOptions.length > 1 && primary?.workspace ? (
      <WorkspaceSwitcher
        memberships={switcherOptions}
        activeWorkspaceId={primary.workspace.id}
      />
    ) : null;

  if (!primary?.workspace) {
    return (
      <AppShell
        role="professor"
        active="workspace"
        topbarTitle="Workspace"
        topbarActions={switcher}
      >
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
            { label: 'Workspace' },
          ]}
          eyebrow="Tenant"
          title="No workspace yet"
          description="Ask your SOL contact to provision a workspace and send you a claim link."
        />
      </AppShell>
    );
  }

  const workspace = primary.workspace;
  const license = workspace.licenses?.[0];
  const [used, entitlement, workspaceCourses] = await Promise.all([
    fetchWorkspaceActiveLearnerCount(workspace.id),
    assertWorkspaceAllowsCourseCreate(workspace.id),
    fetchWorkspaceCoursesWithSections(workspace.id),
  ]);
  const hasLiveStripe =
    Boolean(license?.stripeSubscriptionId) && license?.status === 'active';
  const hasCompAccess = Boolean(license && licenseHasOpenCompWindow(license));
  const isIndefinitePilot =
    hasCompAccess && !license?.periodEnd && !hasLiveStripe;
  const needsStripeBilling =
    (workspace.type === 'creator' || workspace.type === 'business') &&
    !hasLiveStripe;
  const isInvoice =
    workspace.type === 'department' || workspace.type === 'institution';

  const canInviteFaculty = primary
    ? await userCanInviteWorkspaceFaculty(user.id, primary.workspaceId)
    : false;

  const canTransferOwnership = await authorize(user, 'ownership.transfer', {
    tenantId: workspace.id,
    scopeType: 'organization',
    scopeId: workspace.id,
  });

  const {
    fetchWorkspaceTeamMembers,
    fetchWorkspacePendingInvites,
  } = await import('@/lib/db/facultyStudentReads');
  const facultyMembers = canInviteFaculty
    ? await fetchWorkspaceTeamMembers(workspace.id)
    : [];

  const pendingFacultyInvites = canInviteFaculty
    ? await fetchWorkspacePendingInvites(workspace.id)
    : [];
  const openInvites = pendingFacultyInvites.filter(
    (i) => i.expiresAt.getTime() > Date.now() && i.role !== 'owner',
  );
  const accessRequests = canInviteFaculty
    ? await listPendingAccessRequests(workspace.id, user.id)
    : [];

  const seatCap = license?.seatCap ?? 0;
  const billingLabel = isInvoice
    ? 'Invoiced'
    : hasLiveStripe
      ? 'Stripe active'
      : workspace.status === 'suspended'
        ? 'Pilot revoked'
        : isIndefinitePilot
          ? 'Indefinite pilot'
          : hasCompAccess
            ? 'Complimentary'
            : needsStripeBilling
              ? 'Billing needed'
              : license?.status ?? '—';

  const pilotRevoked =
    workspace.status === 'suspended' ||
    (!entitlement.ok &&
      entitlement.code === 'billing_required' &&
      !hasCompAccess);

  const createDisabledReason = entitlement.ok
    ? undefined
    : entitlement.code === 'billing_required'
      ? pilotRevoked
        ? 'Pilot ended. Finish billing to keep teaching, or ask SOL to restore access.'
        : hasCompAccess
          ? entitlement.reason
          : 'Complete billing in the sidebar before creating courses.'
      : entitlement.reason;

  return (
    <AppShell
      role="professor"
      active="workspace"
      topbarTitle="Workspace"
      topbarActions={switcher}
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: withBasePath('/dashboard/professor') },
          { label: 'Workspace' },
        ]}
        eyebrow="Workspace"
        title={workspace.name}
        description={`${workspace.type} · ${workspace.slug}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {canInviteFaculty ? (
              <WorkspaceExportButton workspaceId={workspace.id} />
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={appPath('/dashboard/workspace/knowledge')}>
                Knowledge
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={appPath('/dashboard/workspace/lti')}>
                LTI
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={appPath('/dashboard/workspace/audit')}>
                Audit
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={appPath('/dashboard/professor/courses')}>
                Open courses
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        }
      />

      {pilotRevoked ? (
        <div className="mt-6">
          <TeachingPaywallBanner
            workspaceId={workspace.id}
            reason={createDisabledReason}
            showCheckout={needsStripeBilling}
          />
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="License"
          value={license?.plan ?? '—'}
          hint={
            <>
              {billingLabel}
              {license?.billingProvider ? ` · ${license.billingProvider}` : ''}
            </>
          }
          icon={<CreditCard className="h-4 w-4" />}
          accent={needsStripeBilling && !hasCompAccess}
        />
        <StatCard
          label="Seats"
          value={
            <>
              {used.toLocaleString()}
              <span className="text-[0.55em] font-normal text-ink-faint">
                {' '}
                / {seatCap.toLocaleString()}
              </span>
            </>
          }
          hint="Active learners"
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          label="Courses"
          value={workspaceCourses.length}
          hint="In this workspace"
          icon={<BookOpen className="h-4 w-4" />}
        />
      </div>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Primary: courses */}
        <div className="min-w-0 space-y-6">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Courses</p>
              <h2 className="mt-1 font-display text-2xl tracking-tight text-ink">
                Courses &amp; sections
              </h2>
            </div>
          </div>

          <CreateCourseForm
            workspaceId={workspace.id}
            disabled={!entitlement.ok}
            disabledReason={createDisabledReason}
            defaultOpen={workspaceCourses.length === 0 && entitlement.ok}
            redirectToCourseHub
          />

          {workspaceCourses.length === 0 ? (
            <EmptyState
              eyebrow="Empty"
              title="No courses yet"
              description="Create a course to open its hub — materials, authoring, and sections with enrollment codes."
            />
          ) : (
            <WorkspaceCourseList
              canAddSections={entitlement.ok}
              courses={workspaceCourses.map((c) => ({
                id: c.id,
                title: c.title,
                description: c.description,
                status: c.status,
                sections: c.sections.map((s) => ({
                  id: s.id,
                  name: s.name,
                  professorEnrollmentCode: s.professorEnrollmentCode,
                  studentEnrollmentCode: s.studentEnrollmentCode,
                })),
              }))}
            />
          )}
        </div>

        {/* Aside: billing + team */}
        <aside className="space-y-5 lg:sticky lg:top-6">
          <div className="rounded-2xl border border-rule/80 bg-surface paper-shadow p-5">
            <p className="eyebrow">Plan</p>
            <h2 className="mt-1 font-display text-lg tracking-tight text-ink">
              Billing
            </h2>
            <div className="mt-4 space-y-3 text-sm text-ink-muted">
              {isInvoice ? (
                <p>
                  Campus plans are invoiced by SOL
                  {license?.status === 'active' ? ' · license active' : ''}.
                </p>
              ) : hasLiveStripe ? (
                <p>Stripe subscription is active for this workspace.</p>
              ) : (
                <>
                  {pilotRevoked ? (
                    <p>
                      Pilot ended. Finish billing to keep teaching, or ask SOL
                      to restore access.
                    </p>
                  ) : isIndefinitePilot ? (
                    <p>Complimentary pilot — no end date.</p>
                  ) : hasCompAccess && license?.periodEnd ? (
                    <p>
                      Complimentary access until{' '}
                      <LocalDateTime value={license.periodEnd} dateOnly />.
                    </p>
                  ) : null}
                  {needsStripeBilling && !isIndefinitePilot ? (
                    <div className="space-y-3">
                      <p>
                        {pilotRevoked
                          ? 'Complete Checkout to resume teaching on this workspace.'
                          : 'Complete Checkout to keep creating courses after the trial window.'}
                      </p>
                      <WorkspaceBillingButton workspaceId={workspace.id} />
                    </div>
                  ) : !pilotRevoked && !hasCompAccess ? (
                    <p>No action needed right now.</p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {canInviteFaculty ? (
            <div className="rounded-2xl border border-rule/80 bg-surface paper-shadow p-4">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-display text-base tracking-tight text-ink">
                  Team
                </h2>
                <span className="text-[0.65rem] uppercase tracking-[0.06em] text-ink-faint">
                  {facultyMembers.length} member
                  {facultyMembers.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-3">
                <InviteFacultyForm workspaceId={workspace.id} />
              </div>

              {facultyMembers.length > 0 ? (
                <ul className="mt-3 divide-y divide-rule/50 border-t border-rule/50">
                  {facultyMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <p className="min-w-0 truncate text-ink">
                        {m.user?.email ?? m.userId}
                      </p>
                      {m.userId !== user.id ? (
                        <RemoveMemberButton
                          workspaceId={workspace.id}
                          membershipId={m.id}
                          label={m.user?.email ?? 'member'}
                        />
                      ) : (
                        <span className="shrink-0 text-[0.65rem] uppercase tracking-[0.06em] text-ink-faint">
                          You
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}

              {openInvites.length > 0 ? (
                <ul className="mt-2 space-y-1.5 border-t border-rule/50 pt-2">
                  {openInvites.map((i) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <p className="min-w-0 truncate text-ink-muted">
                        {i.email} · pending
                      </p>
                      <RevokeInviteButton
                        workspaceId={workspace.id}
                        inviteId={i.id}
                        email={i.email}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}

              <details className="mt-3 border-t border-rule/50 pt-2">
                <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-muted">
                  More team tools
                </summary>
                <div className="mt-3 space-y-4">
                  <FacultyCsvImportForm workspaceId={workspace.id} />
                  <div>
                    <p className="mb-2 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-ink-faint">
                      Access requests
                    </p>
                    <AccessRequestsPanel
                      workspaceId={workspace.id}
                      initialRequests={accessRequests.map((r) => ({
                        id: r.id,
                        email: r.email,
                        name: r.name,
                        claimedRole: r.claimedRole,
                        createdAt: r.createdAt,
                      }))}
                    />
                  </div>
                  {canTransferOwnership ? (
                    <TransferOwnershipForm
                      workspaceId={workspace.id}
                      candidates={facultyMembers
                        .filter((m) => m.userId !== user.id)
                        .map((m) => ({
                          userId: m.userId,
                          label: m.user?.email ?? m.userId,
                        }))}
                    />
                  ) : null}
                </div>
              </details>
            </div>
          ) : null}

          {memberships.length > 1 ? (
            <div className="rounded-2xl border border-rule/70 bg-surface-sunken/40 px-5 py-4">
              <p className="eyebrow">Also a member of</p>
              <ul className="mt-2 space-y-1.5 text-sm text-ink-muted">
                {memberships.slice(1).map((m) => (
                  <li key={m.id}>
                    {m.workspace?.name}{' '}
                    <span className="text-ink-faint">(member)</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </AppShell>
  );
}
