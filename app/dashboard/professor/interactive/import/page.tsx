import { eq } from "drizzle-orm";
import { requireTeachingAccess } from '@/lib/authz/gates';

import { H5pImportForm } from "@/components/interactives/H5pImportForm";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { partitionEnrollmentsByConclusion } from "@/lib/sections/availability";
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';

export default async function ImportH5pPage() {
  const user = await requireTeachingAccess();

  const teachingIds = await listTeachingSectionIds(user);
  const sectionRows = teachingIds.length ? await fetchSectionsByIds(teachingIds) : [];
  const professorSectionsList = sectionRows.map((section) => ({
    section: {
      id: section.id,
      name: section.name,
      endsAt: section.endsAt,
      createdAt: new Date(),
      courseId: section.courseId,
      course: section.course ?? { id: section.courseId, title: 'Course', description: null },
    },
    enrolledAt: new Date(),
  }));
  const { active } = partitionEnrollmentsByConclusion(professorSectionsList);
  const sections = active.map((ps) => ({
    id: ps.section.id,
    title: `${ps.section.course.title} - ${ps.section.name}`,
    courseId: ps.section.courseId,
  }));

  return (
    <AppShell
      role="professor"
      user={user}
      active="assignments"
      topbarTitle="Import H5P"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          {
            label: "Assignments",
            href: withBasePath("/dashboard/professor/assignments"),
          },
          { label: "Import H5P" },
        ]}
        eyebrow="Interactive"
        title="Import an H5P package."
        description="Bring an existing .h5p activity into Assignments. Students get completion credit, not a quiz score."
      />
      <div className="mt-8">
        <H5pImportForm sections={sections} />
      </div>
    </AppShell>
  );
}
