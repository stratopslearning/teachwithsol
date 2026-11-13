/**
 * Shared gradebook matrix for section + course hub Grades pages.
 */
import { logGradebookAccess } from '@/lib/audit';
import type { GradebookLearnerRow } from '@/components/sections/SectionGradebookTable';
import { fetchAttemptScoreRowsForSections } from '@/lib/db/facultyStudentReads';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import { comparePersonsByLastName } from '@/lib/personName';
import { loadSectionDetailData } from '@/lib/sectionDetailData';

export type SectionGradebookMatrix = {
  sectionId: string;
  sectionName: string;
  courseTitle: string | null;
  learners: GradebookLearnerRow[];
  quizzes: Array<{ id: string; title: string }>;
  completionColumns: Array<{
    id: string;
    title: string;
    type: 'LESSON' | 'DISCUSSION' | 'INTERACTIVE';
  }>;
};

export async function loadSectionGradebookMatrix(opts: {
  sectionId: string;
  actor: {
    id: string;
    clerkId: string | null;
    platformStaff?: boolean;
  };
}): Promise<SectionGradebookMatrix | null> {
  const { sectionId, actor } = opts;
  const [detail, sectionMeta] = await Promise.all([
    loadSectionDetailData(sectionId),
    fetchSectionById(sectionId),
  ]);
  if (!detail || !sectionMeta || sectionMeta.deletedAt) return null;

  const tenantId = sectionMeta.tenantId ?? sectionMeta.workspaceId;
  await logGradebookAccess({
    actorUserId: actor.id,
    actorClerkId: actor.clerkId,
    sectionId,
    role: actor.platformStaff ? 'ADMIN' : 'PROFESSOR',
    tenantId: tenantId ?? null,
  });

  const students = detail.learnerEnrollments
    .filter((e) => e.status === 'ACTIVE')
    .map((e) => e.person)
    .sort((a, b) => comparePersonsByLastName(a, b));

  const sectionQuizzes = detail.quizzes;
  const quizIds = sectionQuizzes.map((q) => q.id);

  const scoreRows = await fetchAttemptScoreRowsForSections([sectionId]);
  const studentQuizScores: Record<
    string,
    Record<
      string,
      { score: number; percentage: number; maxScore: number; attemptId?: string }
    >
  > = {};
  for (const row of scoreRows) {
    if (!quizIds.includes(row.quizId)) continue;
    const pct = row.percentage ?? 0;
    const score = row.score ?? 0;
    if (!studentQuizScores[row.studentId]) studentQuizScores[row.studentId] = {};
    const existing = studentQuizScores[row.studentId][row.quizId];
    if (
      !existing ||
      pct > existing.percentage ||
      (pct === existing.percentage && score > existing.score)
    ) {
      studentQuizScores[row.studentId][row.quizId] = {
        score,
        percentage: pct,
        maxScore: row.maxScore ?? 0,
      };
    }
  }

  const completionColumns: SectionGradebookMatrix['completionColumns'] = [];

  const learners: GradebookLearnerRow[] = students.map((student) => {
    const bestPercentages = sectionQuizzes
      .map((quiz) => studentQuizScores[student.id]?.[quiz.id]?.percentage)
      .filter((p): p is number => p != null);
    const average =
      bestPercentages.length > 0
        ? Math.round(
            bestPercentages.reduce((sum, p) => sum + p, 0) /
              bestPercentages.length,
          )
        : null;

    const cells: GradebookLearnerRow['cells'] = {};
    for (const quiz of sectionQuizzes) {
      const cell = studentQuizScores[student.id]?.[quiz.id];
      if (cell) cells[quiz.id] = cell;
    }

    return {
      id: student.id,
      person: {
        firstName: student.firstName,
        lastName: student.lastName,
        email: student.email,
      },
      cells,
      completions: {},
      average,
    };
  });

  return {
    sectionId,
    sectionName: detail.section.name,
    courseTitle: detail.section.course?.title ?? null,
    learners,
    quizzes: sectionQuizzes.map((q) => ({ id: q.id, title: q.title })),
    completionColumns,
  };
}
