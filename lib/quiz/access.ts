import { authorize, userHasAnyBinding } from '@/lib/authz/authorize';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { TEACHING_ROLES } from '@/lib/authz/permissions';
import {
  fetchQuizById,
  fetchQuizSectionIds,
  fetchSectionById,
  fetchCourseById,
} from '@/lib/db/entityScopedReads';
import type { UserData } from '@/lib/getOrCreateUser';
import { shouldHideFeedbackForStudent } from '@/lib/quiz/feedback';

async function resolveQuizTenantId(quizId: string): Promise<string | null> {
  const quiz = await fetchQuizById(quizId);
  if (quiz?.tenantId) return quiz.tenantId;

  const sectionIds = await fetchQuizSectionIds(quizId);
  if (sectionIds.length === 0) return null;

  const section = await fetchSectionById(sectionIds[0]!);
  if (section?.tenantId) return section.tenantId;
  if (section?.workspaceId) return section.workspaceId;
  if (!section?.courseId) return null;

  const course = await fetchCourseById(section.courseId);
  return course?.workspaceId ?? null;
}

/**
 * Whether the user may view attempts/questions for a quiz (11b/11d cutover).
 * Access comes from role bindings only.
 */
export async function professorCanAccessQuiz(
  user: Pick<UserData, 'id'> & { platformStaff?: boolean | null },
  quizId: string,
): Promise<boolean> {
  const quiz = await fetchQuizById(quizId);
  if (!quiz) return false;

  const tenantId = quiz.tenantId ?? (await resolveQuizTenantId(quizId));
  if (!tenantId) return false;

  if (quiz.offeringId) {
    if (
      await authorize(user, 'content.read', {
        tenantId,
        scopeType: 'offering',
        scopeId: quiz.offeringId,
      })
    ) {
      return true;
    }
  }

  const links = await fetchQuizSectionIds(quizId);
  for (const sectionId of links) {
    if (
      (await authorizeOnSection(user, 'content.read', sectionId)) ||
      (await authorizeOnSection(user, 'grade.write', sectionId))
    ) {
      return true;
    }
  }

  const authorId = String(quiz.professorId ?? '');
  if (authorId && authorId === String(user.id)) {
    return userHasAnyBinding(user.id, tenantId, TEACHING_ROLES);
  }
  return false;
}

/**
 * Sections of this quiz the user may read results for.
 */
export async function accessibleQuizSectionIds(
  user: Pick<UserData, 'id'> & { platformStaff?: boolean | null },
  quizId: string,
): Promise<string[]> {
  const links = await fetchQuizSectionIds(quizId);
  const out: string[] = [];
  for (const sectionId of links) {
    if (await authorizeOnSection(user, 'content.read', sectionId)) {
      out.push(sectionId);
    }
  }
  return out;
}

/** Content-write variant used by authoring surfaces (calibration, edit). */
export async function userCanWriteQuiz(
  user: Pick<UserData, 'id'> & { platformStaff?: boolean | null },
  quizId: string,
): Promise<boolean> {
  const quiz = await fetchQuizById(quizId);
  if (!quiz) return false;
  const tenantId = quiz.tenantId ?? (await resolveQuizTenantId(quizId));
  if (!tenantId) return false;
  if (
    quiz.offeringId &&
    (await authorize(user, 'content.write', {
      tenantId,
      scopeType: 'offering',
      scopeId: quiz.offeringId,
    }))
  ) {
    return true;
  }
  const links = await fetchQuizSectionIds(quizId);
  for (const sectionId of links) {
    if (await authorizeOnSection(user, 'content.write', sectionId)) return true;
  }
  const authorId = String(quiz.professorId ?? '');
  if (authorId && authorId === String(user.id)) {
    return userHasAnyBinding(user.id, tenantId, TEACHING_ROLES);
  }
  return false;
}

/** Legacy STUDENT/PROFESSOR/ADMIN label for shouldHideFeedbackForStudent only. */
export async function resolveQuizFeedbackViewerRole(
  user: Pick<UserData, 'id'> & { platformStaff?: boolean | null },
  quizId: string,
): Promise<string> {
  if (user.platformStaff) return 'ADMIN';
  if (await professorCanAccessQuiz(user, quizId)) return 'PROFESSOR';
  return 'STUDENT';
}

export type AttemptFeedbackFields = {
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  gptFeedback: unknown;
};

/** Strip scores/feedback for students while hide-until-due is active. */
export function redactAttemptFeedbackForViewer<T extends AttemptFeedbackFields>(
  attempt: T,
  quiz: { endDate: Date | null; hideFeedbackAfterDue?: boolean | null },
  userRole: string,
): T {
  if (!shouldHideFeedbackForStudent(quiz, userRole)) return attempt;
  return {
    ...attempt,
    score: null,
    percentage: null,
    gptFeedback: null,
  };
}

/** Strip answer keys and rubrics for non-author viewers. */
export function stripQuestionSecrets<
  T extends {
    correctAnswer?: unknown;
    rubric?: unknown;
    rubricVersion?: unknown;
  },
>(question: T): T {
  return {
    ...question,
    correctAnswer: null,
    rubric: null,
    rubricVersion: null,
  };
}
