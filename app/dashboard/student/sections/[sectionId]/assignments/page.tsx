import { AssignmentsTableClient } from '@/components/assignments/AssignmentsTableClient';
import { SectionHubShell } from '@/components/student/SectionHubShell';
import { listStudentActivities } from '@/lib/assignments';
import { requireStudent } from '@/lib/auth';
import { loadCourseNav } from '@/lib/lms/loadCourseNav';
import { requireStudentSectionAccess } from '@/lib/student/sectionAccess';

export default async function StudentSectionAssignmentsPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const user = await requireStudent();
  const { sectionId } = await params;
  const ctx = await requireStudentSectionAccess(user.id, sectionId);
  const [items, lms] = await Promise.all([
    listStudentActivities({
      studentId: user.id,
      sectionIds: [sectionId],
    }),
    loadCourseNav(ctx.courseId),
  ]);

  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      description="Quizzes, lessons, and interactives assigned to this section."
      activeTab="assignments"
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
    >
      <AssignmentsTableClient items={items} role="student" />
    </SectionHubShell>
  );
}
