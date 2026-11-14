import { AssignmentsPanel } from '@/components/lms/AssignmentsPanel';
import { CourseHubShell } from '@/components/professor/CourseHubShell';
import { listCourseActivities } from '@/lib/assignments';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import {
  facultyActiveTool,
  requireFacultyCourse,
} from '@/lib/lms/facultyCourseContext';
import { listAssignmentGroupsDefiner } from '@/lib/db/lmsDefiners';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import { assertWorkspaceAllowsTeaching } from '@/lib/workspace';

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
  const { course, lms, user } = await requireFacultyCourse(courseId);
  const teachingEntitlement = course.workspaceId
    ? await assertWorkspaceAllowsTeaching(course.workspaceId)
    : { ok: true as const };
  const teachingBlocked =
    !teachingEntitlement.ok &&
    teachingEntitlement.code === 'billing_required';

  const [groups, activities, teachableSectionIds] = await Promise.all([
    listAssignmentGroupsDefiner(courseId),
    listCourseActivities({ courseId }),
    listTeachableSectionIdsForCourse(user, courseId),
  ]);
  const sectionRows = teachableSectionIds.length
    ? await fetchSectionsByIds(teachableSectionIds)
    : [];
  const sectionOptions = sectionRows.map((s) => ({
    id: s.id,
    title: s.name,
  }));

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
        teachingBlocked={teachingBlocked}
        items={activities}
        sectionOptions={sectionOptions}
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
