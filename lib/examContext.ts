import { loadExamContextDefiner } from '@/lib/db/studentWriteDefiners';
import type {
  assignments,
  attempts,
  quizSections,
  quizzes,
} from '@/app/db/schema';

export type ExamAssignment = typeof assignments.$inferSelect;
export type ExamQuiz = typeof quizzes.$inferSelect;
export type ExamAttempt = typeof attempts.$inferSelect;
export type ExamQuizSection = typeof quizSections.$inferSelect;

export type ExamContext = {
  assignment: ExamAssignment | undefined;
  quiz: ExamQuiz | undefined;
  inProgressAttempt: ExamAttempt | undefined;
  submittedCount: number;
  quizSectionLinks: ExamQuizSection[];
};

/**
 * Exam rows via SECURITY DEFINER (FORCE RLS safe). Callers must still apply
 * checks in order (assignment → quiz → section → window).
 */
export async function loadExamContext(args: {
  quizId: string;
  assignmentId: string;
  studentId: string;
  includeSections?: boolean;
  includeSubmittedAttempts?: boolean;
}): Promise<ExamContext> {
  const {
    quizId,
    assignmentId,
    studentId,
    includeSections = true,
    includeSubmittedAttempts = true,
  } = args;

  const ctx = await loadExamContextDefiner({
    quizId,
    assignmentId,
    studentId,
  });

  return {
    assignment: ctx.assignment,
    quiz: ctx.quiz,
    inProgressAttempt: ctx.inProgressAttempt,
    submittedCount: includeSubmittedAttempts ? ctx.submittedCount : 0,
    quizSectionLinks: includeSections ? ctx.quizSectionLinks : [],
  };
}

/**
 * Which required row is missing. Assignment wins when both are absent —
 * the same order start/submit used before parallel fetch.
 */
export function missingExamResource(
  assignment: unknown,
  quiz: unknown,
): 'assignment' | 'quiz' | null {
  if (!assignment) return 'assignment';
  if (!quiz) return 'quiz';
  return null;
}
