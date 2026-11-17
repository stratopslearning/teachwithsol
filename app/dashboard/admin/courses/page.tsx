import { CourseFormModal } from '@/components/admin/CourseFormModal';
import { AppShell } from '@/components/layout/AppShell';
import { PageHeader } from '@/components/layout/PageHeader';
import { fetchAdminCoursesAll } from '@/lib/admin/platformReads';
import { requireAdmin } from '@/lib/auth';
import { withBasePath } from '@/lib/basePath';
import { partitionBySectionConclusion } from '@/lib/sections/availability';
import {
  listCoursesForWorkspace,
  resolveWorkspaceScopeParam,
} from '@/lib/workspace/queries';

import AdminCoursesPageContentClient from './AdminCoursesPageContentClient';

export default async function AdminCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const scope = resolveWorkspaceScopeParam(params.workspaceId);

  let coursesWithCount: Array<{
    id: string;
    title: string;
    description: string | null;
    createdAt: Date;
    sectionCount: number;
  }> = [];

  if (scope === 'all') {
    const all = await fetchAdminCoursesAll();
    coursesWithCount = all.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      createdAt: c.createdAt,
      sectionCount: c.sectionCount,
    }));
  } else if (scope) {
    const allCourses = await listCoursesForWorkspace(scope);
    const sectionCountByCourse: Record<string, number> = {};
    for (const course of allCourses) {
      const { active } = partitionBySectionConclusion(
        course.sections.map((s) => ({
          ...s,
          courseId: course.id,
          endsAt: null,
        })),
      );
      sectionCountByCourse[course.id] = active.length;
    }
    coursesWithCount = allCourses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      createdAt: c.createdAt,
      sectionCount: sectionCountByCourse[c.id] || 0,
    }));
  }

  return (
    <AppShell
      role="admin"
      active="workspaces"
      topbarTitle="Courses"
      user={{
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
      }}
    >
      <PageHeader
        breadcrumbs={[
          { label: 'Overview', href: withBasePath('/dashboard/admin') },
          { label: 'Courses' },
        ]}
        eyebrow="Catalog"
        title="Courses"
        description="Support catalog for one tenant. Open this from a workspace row — no silent default."
        actions={<CourseFormModal mode="create" />}
      />
      <p className="mt-4 text-xs text-ink-faint">
        {scope === 'all'
          ? 'Showing all workspaces (?workspaceId=all).'
          : scope
            ? `Scoped to workspace ${scope}.`
            : 'No workspace selected. Use Workspaces → Catalog on a tenant row.'}
      </p>
      <div className="mt-6">
        <AdminCoursesPageContentClient courses={coursesWithCount} />
      </div>
    </AppShell>
  );
}
