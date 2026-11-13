import { AssignmentsPanel } from '@/components/lms/AssignmentsPanel';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { listCourseActivities } from '@/lib/assignments';
import {
  facultyActiveTool,
  requireFacultyCourse,
} from '@/lib/lms/facultyCourseContext';
import { listAssignmentGroupsDefiner } from '@/lib/db/lmsDefiners';

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
  const { course, lms } = await requireFacultyCourse(courseId);
  const [groups, activities] = await Promise.all([
    listAssignmentGroupsDefiner(courseId),
    listCourseActivities({ courseId }),
  ]);
  return (
    <CourseHubShell
      courseId={courseId}
      courseTitle={course.title}
      activeTab={facultyActiveTool('assignments', lms.enabled)}
      tools={lms.enabled ? lms.facultyTools : undefined}
      nav={lms.nav}
      studentView={studentView}
    >
      <AssignmentsPanel
        courseId={courseId}
        studentPreview={studentView}
        items={activities}
        groups={groups.map((g) => ({
          id: String(g.id),
          name: String(g.name),
          weight: Number(g.weight) || 0,
          dropLowest: Number(g.dropLowest) || 0,
        }))}
      />
    </CourseHubShell>
  );
}
