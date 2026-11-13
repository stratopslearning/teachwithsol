import { GradesPanel } from '@/components/lms/GradesPanel';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import {
  facultyActiveTool,
  requireFacultyCourse,
} from '@/lib/lms/facultyCourseContext';

export const dynamic = 'force-dynamic';

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ as?: string }>;
}) {
  const { courseId } = await params;
  const studentView = (await searchParams).as === 'student';
  const { user, course, lms } = await requireFacultyCourse(courseId);
  const sectionIds = await listTeachableSectionIdsForCourse(user, courseId);
  const sections = sectionIds.length
    ? await fetchSectionsByIds(sectionIds)
    : [];
  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={course.title}
      activeTab={facultyActiveTool('grades', lms.enabled)}
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
    >
      <GradesPanel
        studentPreview={studentView}
        sections={sections.map((s) => ({ id: s.id, name: s.name }))}
      />
    </CourseHubShell>
  );
}
