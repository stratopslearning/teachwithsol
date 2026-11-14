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
      description="Assigned work for this section"
      activeTab="assignments"
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
    >
      <div className="space-y-5">
        <div>
          <h2 className="font-display text-2xl text-ink">Assignments</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Quizzes, lessons, discussions, and interactives released to you.
          </p>
        </div>
        <AssignmentsTableClient items={items} role="student" />
      </div>
    </SectionHubShell>
  );
}
