/**
 * Professor quiz reads, shared by the REST API and MCP tools. Mirrors the SSR
 * logic of `/dashboard/professor/quizzes` and the quiz edit loader.
 */
import { eq, inArray } from 'drizzle-orm';

import { quizSections, quizzes } from '@/app/db/schema';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import { readBySectionTenants, withQuizTenant } from '@/lib/db/sectionTenants';
import { ApiError } from '@/lib/api/errors';
import { activeOnly } from '@/lib/db/filters';
import type { UserData } from '@/lib/getOrCreateUser';
import { listTeachingSectionIds } from '@/lib/professor/graderSections';
import {
  professorCanAccessQuiz,
  stripQuestionSecrets,
  userCanWriteQuiz,
} from '@/lib/quiz/access';
import { partitionEnrollmentsByConclusion } from '@/lib/sections/availability';

type ProfessorUser = Pick<UserData, 'id'> & { platformStaff?: boolean | null };

export type ProfessorQuizSummary = {
  id: string;
  title: string;
  description: string | null;
  ownedByMe: boolean;
  isActive: boolean;
  questionCount: number;
  maxAttempts: number;
  timeLimit: number | null;
  passingScore: number;
  startDate: Date | null;
  endDate: Date | null;
  sections: { id: string; name: string }[];
  submittedAttempts: number;
  uniqueStudents: number;
  /** Class average of best percentage per student. */
  averageScore: number;
  createdAt: Date;
};

export async function listProfessorQuizzes(
  user: ProfessorUser,
): Promise<ProfessorQuizSummary[]> {
  // Binding-derived teaching sections (professor_sections is metadata only).
  const teachingIds = await listTeachingSectionIds(user);
  if (teachingIds.length === 0) return [];
  // FORCE RLS: plain db reads return nothing (the quiz list was always
  // empty). Sections come from the definer; links are read per tenant.
  const teachingSections = await fetchSectionsByIds(teachingIds);
  const { active: ongoing } = partitionEnrollmentsByConclusion(
    teachingSections.map((section) => ({ sectionId: section.id, section })),
  );
  const sectionIds = ongoing.map((e) => e.sectionId);
  if (sectionIds.length === 0) return [];

  const linkRows = await readBySectionTenants(sectionIds, user.id, (tx, ids) =>
    tx.query.quizSections.findMany({
      where: inArray(quizSections.sectionId, ids),
      with: {
        quiz: {
          with: {
            sectionAssignments: { with: { section: true } },
            attempts: {
              columns: {
                id: true,
                studentId: true,
                submittedAt: true,
                percentage: true,
                score: true,
                maxScore: true,
              },
            },
            questions: { columns: { id: true } },
          },
        },
      },
    }),
  );
  const links = linkRows.sort(
    (a, b) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime(),
  );

  const seen = new Set<string>();
  const result: ProfessorQuizSummary[] = [];

  for (const link of links) {
    const quiz = link.quiz;
    if (!quiz || quiz.deletedAt != null || seen.has(quiz.id)) continue;
    seen.add(quiz.id);

    const submitted = quiz.attempts.filter((a) => a.submittedAt != null);
    const bestPerStudent: Record<string, number> = {};
    for (const a of submitted) {
      const pct =
        a.percentage ??
        (a.maxScore ? Math.round(((a.score ?? 0) / a.maxScore) * 100) : 0);
      if (
        bestPerStudent[a.studentId] == null ||
        pct > bestPerStudent[a.studentId]
      ) {
        bestPerStudent[a.studentId] = pct;
      }
    }
    const best = Object.values(bestPerStudent);
    const averageScore =
      best.length > 0
        ? Math.round(best.reduce((sum, p) => sum + p, 0) / best.length)
        : 0;

    const authorId = quiz.professorId;
    result.push({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      ownedByMe: Boolean(authorId && authorId === user.id),
      isActive: quiz.isActive,
      questionCount: quiz.questions.length,
      maxAttempts: quiz.maxAttempts,
      timeLimit: quiz.timeLimit,
      passingScore: quiz.passingScore,
      startDate: quiz.startDate,
      endDate: quiz.endDate,
      sections: quiz.sectionAssignments
        .filter((sa) => sa.section != null)
        .map((sa) => ({ id: sa.section.id, name: sa.section.name })),
      submittedAttempts: submitted.length,
      uniqueStudents: new Set(submitted.map((a) => a.studentId)).size,
      averageScore,
      createdAt: quiz.createdAt,
    });
  }

  return result;
}

export type ProfessorQuizDetail = {
  id: string;
  title: string;
  description: string | null;
  ownedByMe: boolean;
  isActive: boolean;
  maxAttempts: number;
  timeLimit: number | null;
  passingScore: number;
  startDate: Date | null;
  endDate: Date | null;
  sections: { id: string; name: string }[];
  /** Answer keys included only for the owner (or admins). */
  questions: {
    id: string;
    type: string;
    question: string;
    options: unknown;
    correctAnswer: string | null;
    points: number;
    order: number;
    conceptTags: string[];
  }[];
  createdAt: Date;
  updatedAt: Date;
};

export async function getProfessorQuiz(
  user: ProfessorUser,
  quizId: string,
): Promise<ProfessorQuizDetail> {
  const allowed = await professorCanAccessQuiz(user, quizId);
  if (!allowed) throw ApiError.forbidden('You do not have access to this quiz');

  const quiz = await withQuizTenant(quizId, user.id, (tx) =>
    tx.query.quizzes.findFirst({
      where: (t, { and }) => and(eq(t.id, quizId), activeOnly(quizzes.deletedAt)),
      with: {
        questions: { orderBy: (q, { asc }) => [asc(q.order)] },
        sectionAssignments: { with: { section: true } },
      },
    }),
  );
  if (!quiz) throw ApiError.notFound('Quiz not found');

  // Answer keys only for callers with content.write on this quiz (bindings).
  const isOwner = await userCanWriteQuiz(user, quizId);
  const authorId = quiz.professorId;

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    ownedByMe: Boolean(authorId && authorId === user.id),
    isActive: quiz.isActive,
    maxAttempts: quiz.maxAttempts,
    timeLimit: quiz.timeLimit,
    passingScore: quiz.passingScore,
    startDate: quiz.startDate,
    endDate: quiz.endDate,
    sections: quiz.sectionAssignments
      .filter((sa) => sa.section != null)
      .map((sa) => ({ id: sa.section.id, name: sa.section.name })),
    questions: quiz.questions.map((q) => {
      const base = {
        id: q.id,
        type: q.type,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points,
        order: q.order,
        conceptTags: (q.conceptTags ?? []) as string[],
      };
      // Co-teachers may view stems but never answer keys or rubrics.
      return isOwner ? base : stripQuestionSecrets(base);
    }),
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  };
}
