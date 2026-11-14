import { requireTeachingAccess } from '@/lib/authz/gates';

import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuizCreationForm } from "@/components/quiz/QuizCreationForm";
import { withBasePath } from "@/lib/basePath";
import { fetchSectionsByIds } from "@/lib/db/entityScopedReads";
import { listTeachingSectionIds } from "@/lib/professor/graderSections";
import { partitionEnrollmentsByConclusion } from "@/lib/sectionAvailability";

export default async function CreateQuizPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string; import?: string }>;
}) {
  const user = await requireTeachingAccess();

  const { courseId, import: importMode } = await searchParams;
  const startOnCsv = importMode === "csv";

  const teachingIds = await listTeachingSectionIds(user);
  const sectionRows = teachingIds.length
    ? await fetchSectionsByIds(teachingIds)
    : [];
  const enrollments = sectionRows.map((section) => ({
    section: {
      id: section.id,
      name: section.name,
      endsAt: section.endsAt,
      createdAt: new Date(),
      courseId: section.courseId,
      course: section.course
        ? {
            id: section.course.id,
            title: section.course.title,
            description: null as string | null,
          }
        : { id: section.courseId, title: 'Course', description: null },
    },
    enrolledAt: new Date(),
  }));
  const { active: ongoingEnrollments } =
    partitionEnrollmentsByConclusion(enrollments);

  let enrolledSections = ongoingEnrollments.map((ps) => ({
    id: ps.section.id,
    title: `${ps.section.course.title} - ${ps.section.name}`,
    description: ps.section.course.description,
    courseId: ps.section.courseId,
  }));

  let defaultSectionIds: string[] | undefined;
  let successHref: string | undefined;

  if (courseId) {
    enrolledSections = enrolledSections.filter((s) => s.courseId === courseId);
    defaultSectionIds = enrolledSections.map((s) => s.id);
    successHref = withBasePath(
      `/dashboard/professor/courses/${courseId}/assignments`,
    );
  }

  return (
    <AppShell
      role="professor"
      active="courses"
      topbarTitle="New quiz"
      maxWidth="narrow"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: withBasePath("/dashboard/professor") },
          {
            label: "Courses",
            href: withBasePath("/dashboard/professor/courses"),
          },
          ...(courseId
            ? [
                {
                  label: "Assignments",
                  href: withBasePath(
                    `/dashboard/professor/courses/${courseId}/assignments`,
                  ),
                },
              ]
            : []),
          { label: "New quiz" },
        ]}
        eyebrow="Quiz"
        title="Create quiz"
        description="Write questions and assign them to the sections you teach."
      />
      <div className="mt-12">
        <QuizCreationForm
          courses={enrolledSections}
          defaultSectionIds={defaultSectionIds}
          successHref={successHref}
          initialStep={startOnCsv ? 2 : 1}
        />
      </div>
    </AppShell>
  );
}
