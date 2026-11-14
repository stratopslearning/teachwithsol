import { SectionHubShell } from '@/components/student/SectionHubShell';
import { listStudentActivities } from '@/lib/assignments';
import { requireStudent } from '@/lib/auth';
import { listAssignmentGroupsDefiner } from '@/lib/db/lmsDefiners';
import { fetchStudentGradebookAttemptsDefiner } from '@/lib/db/studentWriteDefiners';
import { loadCourseNav } from '@/lib/lms/loadCourseNav';
import { computeWeightedGrade } from '@/lib/lms/weightedGrades';
import { isSectionConcluded } from '@/lib/sectionAvailability';
import { requireStudentSectionAccess } from '@/lib/student/sectionAccess';

import StudentCompletionsClient from '@/app/dashboard/student/grades/StudentCompletionsClient';
import StudentGradesTableClient from '@/app/dashboard/student/grades/StudentGradesTableClient';

export default async function StudentSectionGradesPage({
  params,
}: {
  params: Promise<{ sectionId: string }>;
}) {
  const user = await requireStudent();
  const { sectionId } = await params;
  const ctx = await requireStudentSectionAccess(user.id, sectionId);
  const lms = await loadCourseNav(ctx.courseId);

  const allAttempts = await fetchStudentGradebookAttemptsDefiner(user.id);

  const attemptRows = allAttempts
    .filter((a) => a.sectionId === sectionId)
    .map((a) => ({
      id: a.id,
      quizId: a.quizId,
      sectionId: a.sectionId,
      sectionName: a.sectionName,
      quizTitle: a.quizTitle,
      courseTitle: a.courseTitle,
      submittedAt: a.submittedAt ? a.submittedAt.toISOString() : null,
      score: a.score,
      maxScore: a.maxScore,
      percentage: a.percentage,
      passed: a.passed,
      sectionArchived: isSectionConcluded({ endsAt: a.sectionEndsAt }),
    }));

  const activities = await listStudentActivities({
    studentId: user.id,
    sectionIds: [sectionId],
  });
  const completionRows = activities
    .filter((a) => a.type !== 'QUIZ')
    .map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      courseTitle: a.courseTitle,
      status: a.completionStatus ?? 'NOT_STARTED',
      href: a.href,
    }));

  const groups = await listAssignmentGroupsDefiner(ctx.courseId);
  const bestByQuiz = new Map<string, number>();
  for (const row of attemptRows) {
    if (row.percentage == null || !row.quizId) continue;
    const prev = bestByQuiz.get(row.quizId);
    if (prev == null || row.percentage > prev) {
      bestByQuiz.set(row.quizId, row.percentage);
    }
  }
  const allScores = [...bestByQuiz.values()];
  const weighted = computeWeightedGrade(
    groups.map((g) => ({
      groupId: String(g.id),
      name: String(g.name),
      weight: Number(g.weight ?? 0),
      dropLowest: Number(g.dropLowest ?? 0),
      scores: allScores,
    })),
  );

  return (
    <SectionHubShell
      sectionId={ctx.sectionId}
      sectionName={ctx.sectionName}
      courseTitle={ctx.courseTitle}
      description="Scores and completion for this section"
      activeTab="grades"
      tools={lms.enabled ? lms.studentTools : undefined}
      user={user}
    >
      <div className="space-y-8">
        <div>
          <h2 className="font-display text-2xl text-ink">Grades</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Quiz scores and activity completion for this section.
          </p>
        </div>
        {groups.length > 0 && weighted.total != null ? (
          <div className="rounded-lg border border-rule/70 bg-surface p-4">
            <div className="text-sm text-ink-muted">Weighted total</div>
            <div className="text-2xl font-medium text-ink">
              {weighted.total.toFixed(1)}%
            </div>
            <ul className="mt-3 space-y-1 text-sm text-ink-muted">
              {weighted.groups.map((g) => (
                <li key={g.groupId}>
                  {g.name} ({g.weight}%):{' '}
                  {g.average != null ? `${g.average.toFixed(1)}%` : '—'}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <StudentGradesTableClient
          attempts={attemptRows}
          initialSectionId={sectionId}
        />
        <StudentCompletionsClient rows={completionRows} />
      </div>
    </SectionHubShell>
  );
}
