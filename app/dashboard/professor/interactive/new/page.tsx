import { eq } from "drizzle-orm";
import { requireTeachingAccess } from '@/lib/authz/gates';

import { db } from "@/app/db";
import { professorSections } from "@/app/db/schema";
import { InteractiveCreateForm } from "@/components/interactives/InteractiveCreateForm";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { withBasePath } from "@/lib/basePath";
import { getOrCreateUser } from "@/lib/getOrCreateUser";
import { partitionEnrollmentsByConclusion } from "@/lib/sectionAvailability";
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';

export default async function NewInteractivePage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string }>;
}) {
  const user = await requireTeachingAccess();

  const { courseId } = await searchParams;

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
  let sections = active.map((ps) => ({
    id: ps.section.id,
    title: `${ps.section.course.title} - ${ps.section.name}`,
    courseId: ps.section.courseId,
  }));

  let backHref = withBasePath("/dashboard/professor/courses");
  let backLabel = "Courses";

  if (courseId) {
    sections = sections.filter((s) => s.courseId === courseId);
    backHref = withBasePath(
      `/dashboard/professor/courses/${courseId}/assignments`,
    );
    backLabel = "Course assignments";
  }

  return (
    <AppShell role="professor" user={user} topbarTitle="New interactive">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          {
            label: backLabel,
            href: backHref,
          },
          { label: "New interactive" },
        ]}
        eyebrow="Interactive"
        title="Create an interactive."
        description="Build a fill-blanks, drag-words, hotspot, or accordion activity. Students get completion credit, not a quiz score."
      />
      <div className="mt-8">
        <InteractiveCreateForm sections={sections} />
      </div>
    </AppShell>
  );
}
