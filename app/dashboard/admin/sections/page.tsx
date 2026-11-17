import { AppShell } from '@/components/layout/AppShell';
import {
  fetchAdminCoursesAll,
  fetchAdminSectionsAll,
} from '@/lib/admin/platformReads';
import { requireAdmin } from '@/lib/auth';
import { appPath } from '@/lib/basePath';
import { partitionBySectionConclusion } from '@/lib/sections/availability';
import {
  listCoursesForWorkspace,
  resolveWorkspaceScopeParam,
} from '@/lib/workspace/queries';

import SectionsPageContentClient from './SectionsPageContentClient';

export default async function AdminSectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspaceId?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const scope = resolveWorkspaceScopeParam(params.workspaceId);

  let allCourses: Array<{
    id: string;
    title: string;
    description: string | null;
    createdAt: Date;
    sections: Array<{ id: string; name: string }>;
  }> = [];
  let mapped: Array<{
    id: string;
    courseId: string;
    name: string;
    professorEnrollmentCode: string;
    studentEnrollmentCode: string;
    endsAt: Date | null;
    createdAt: Date;
    isActive: boolean;
    learnerCount: number;
    facultyCount: number;
    course: { id: string; title: string };
  }> = [];

  const toSectionRow = (
    s: Awaited<ReturnType<typeof fetchAdminSectionsAll>>[number],
  ) => ({
    id: s.id,
    courseId: s.courseId,
    name: s.name,
    professorEnrollmentCode: s.professorEnrollmentCode,
    studentEnrollmentCode: s.studentEnrollmentCode,
    endsAt: s.endsAt,
    createdAt: s.createdAt,
    isActive: s.isActive,
    learnerCount: s.learnerCount,
    facultyCount: s.facultyCount,
    course: s.course,
  });

  if (scope === 'all') {
    const [courses, sections] = await Promise.all([
      fetchAdminCoursesAll(),
      fetchAdminSectionsAll(),
    ]);
    allCourses = courses.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      createdAt: c.createdAt,
      sections: [],
    }));
    mapped = sections.map(toSectionRow);
  } else if (scope) {
    allCourses = await listCoursesForWorkspace(scope);
    const courseIds = new Set(allCourses.map((c) => c.id));
    const sections = (await fetchAdminSectionsAll()).filter((s) =>
      courseIds.has(s.courseId),
    );
    mapped = sections.map(toSectionRow);
  }

  const { active: ongoingSections, archived: pastSections } =
    partitionBySectionConclusion(mapped);

  const archivedHref =
    scope === 'all'
      ? appPath('/dashboard/admin/sections/archived')
      : scope
        ? appPath(
            `/dashboard/admin/sections/archived?workspaceId=${encodeURIComponent(scope)}`,
          )
        : appPath('/dashboard/admin/sections/archived');

  return (
    <AppShell
      role="admin"
      active="workspaces"
      topbarTitle="Sections"
      user={{
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
      }}
    >
      <SectionsPageContentClient
        allSections={ongoingSections}
        allCourses={allCourses}
        pastSectionsHref={archivedHref}
        pastSectionsCount={pastSections.length}
      />
    </AppShell>
  );
}
