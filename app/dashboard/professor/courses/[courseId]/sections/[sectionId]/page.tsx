import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ProfessorSectionDetail } from '@/components/sections/ProfessorSectionDetail';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { Button } from '@/components/ui/button';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { appPath, withBasePath } from '@/lib/basePath';
import { assertCanManageCourse } from '@/lib/knowledge';
import { loadCourseNav } from '@/lib/lms/loadCourseNav';
import { assertTeachesSection } from '@/lib/professor/sections';
import { loadSectionDetailData } from '@/lib/sections/detailData';

export const dynamic = 'force-dynamic';

/**
 * Section roster, invites, codes, and coursework — inside the course hub so
 * faculty stay on /courses/[id] instead of a separate Overview → Sections app.
 */
export default async function CourseHubSectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string; sectionId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const user = await requireTeachingAccess();
  const { courseId, sectionId } = await params;
  const studentView = (await searchParams).as === 'student';

  try {
    await assertCanManageCourse(user, courseId);
  } catch {
    notFound();
  }

  try {
    await assertTeachesSection(user, sectionId);
  } catch {
    notFound();
  }

  const data = await loadSectionDetailData(sectionId);
  if (!data) return notFound();
  if (data.section.course?.id && data.section.course.id !== courseId) {
    notFound();
  }

  const lms = await loadCourseNav(courseId);
  const courseTitle = data.section.course?.title ?? 'Course';
  const gradebookHref = withBasePath(
    `/dashboard/professor/sections/${sectionId}/gradebook`,
  );

  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={courseTitle}
      description={`${data.section.name} — roster, enrolment codes, faculty/learner invites, and section coursework.`}
      activeTab="sections"
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              href={appPath(
                `/dashboard/professor/courses/${courseId}/sections`,
              )}
            >
              All sections
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href={gradebookHref}>Gradebook</Link>
          </Button>
        </div>
      }
    >
      <div className="mb-2">
        <p className="eyebrow text-ink-faint">Section</p>
        <h2 className="font-display text-2xl tracking-tight text-ink">
          {data.section.name}
        </h2>
      </div>
      <ProfessorSectionDetail
        sectionId={sectionId}
        data={data}
        gradebookHref={gradebookHref}
      />
    </CourseHubShell>
  );
}
