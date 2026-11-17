import Link from 'next/link';
import {
  FileText,
  Layers,
  Link2,
  ScrollText,
  Users as UsersIcon,
} from '@/components/icons';

import { AdminSection } from '@/components/admin/AdminSection';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatCard } from '@/components/patterns/StatCard';
import { Button } from '@/components/ui/button';
import { countUsers, fetchAdminOverviewStats } from '@/lib/admin/platformReads';
import { appPath } from '@/lib/basePath';
import { requireAdmin } from '@/lib/auth';

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  const [stats, userCounts] = await Promise.all([
    fetchAdminOverviewStats(),
    countUsers(),
  ]);

  const platformStaffCount = userCounts.platformStaff;

  return (
    <AppShell
      role="admin"
      topbarTitle="Overview"
      user={{
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
      }}
    >
      <PageHeader
        eyebrow="Platform ops"
        title="Provision, invite, support."
        description="Multi-tenant control plane. Clients own teaching and Stripe; you create workspaces and help when needed."
      />

      <AdminSection
        first
        eyebrow="Tenants"
        title="At a glance"
        description="Workspace health across Creator, Business, Department, and Institution."
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Workspaces"
            value={stats.workspaceCount}
            hint={`${stats.workspaceCount} total`}
            icon={<Layers className="h-4 w-4" />}
            href="/dashboard/admin/workspaces"
          />
          <StatCard
            label="Open invites"
            value={stats.pendingInviteCount}
            hint="Unclaimed owner links"
            icon={<UsersIcon className="h-4 w-4" />}
            href="/dashboard/admin/workspaces"
            accent={stats.pendingInviteCount > 0}
          />
          <StatCard
            label="Awaiting Stripe"
            value={stats.unpaidLicenseCount}
            hint="Creator/Business licenses"
            icon={<FileText className="h-4 w-4" />}
            href="/dashboard/admin/workspaces"
            accent={stats.unpaidLicenseCount > 0}
          />
          <StatCard
            label="Courses"
            value={stats.courseCount}
            hint="Across all tenants"
            icon={<FileText className="h-4 w-4" />}
            href="/dashboard/admin/workspaces"
          />
        </div>
      </AdminSection>

      <AdminSection
        eyebrow="People"
        title="Who is on the platform"
        description="Staff flags and accounts. Teaching inventory lives on each workspace — open Catalog from Workspaces."
      >
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard
            label="Ongoing sections"
            value={stats.ongoingSectionCount}
            hint="All workspaces"
            icon={<Layers className="h-4 w-4" />}
            href="/dashboard/admin/workspaces"
          />
          <StatCard
            label="Platform staff"
            value={platformStaffCount}
            hint="Ops accounts"
            icon={<UsersIcon className="h-4 w-4" />}
            href="/dashboard/admin/users"
          />
          <StatCard
            label="Total people"
            value={userCounts.total}
            hint="All roles"
            icon={<UsersIcon className="h-4 w-4" />}
            href="/dashboard/admin/users"
            accent
          />
        </div>
      </AdminSection>

      <AdminSection eyebrow="Quick actions" title="What needs doing">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href={appPath('/dashboard/admin/workspaces')}>
              Provision workspace
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={appPath('/dashboard/admin/users')}>People</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={appPath('/dashboard/admin/lti')}>
              <Link2 className="mr-1.5 h-3.5 w-3.5" />
              Canvas LTI
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={appPath('/dashboard/admin/audit')}>
              <ScrollText className="mr-1.5 h-3.5 w-3.5" />
              Audit log
            </Link>
          </Button>
        </div>
        <p className="text-sm text-ink-muted max-w-[60ch]">
          New clients: create a workspace, copy the claim link, let them bill
          and teach. Need a tenant’s courses or sections? Open Catalog from that
          workspace row.
        </p>
      </AdminSection>
    </AppShell>
  );
}
