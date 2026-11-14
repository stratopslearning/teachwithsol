import { authorize, userHasAnyBinding } from '@/lib/authz/authorize';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { TEACHING_ROLES } from '@/lib/authz/permissions';
import { fetchActiveSectionIdsForStudentDefiner } from '@/lib/db/bookWriteDefiners';
import { fetchSectionsByIds } from '@/lib/db/entityScopedReads';
import {
  fetchChatbotByIdDefiner,
  fetchChatbotSectionIdsDefiner,
} from '@/lib/db/studentReadDefiners';
import type { UserData } from '@/lib/getOrCreateUser';
import { professorCanAccessQuiz } from '@/lib/quizAccess';
import type { SafeQuizInput } from '@/lib/chatbot/safeQuizContext';
import { isSectionConcluded } from '@/lib/sectionAvailability';

export async function getActiveChatbot(chatbotId: string) {
  const bot = await fetchChatbotByIdDefiner(chatbotId);
  if (!bot || !bot.isActive) return null;
  return bot;
}

/** Sections where this chatbot is assigned. */
export async function getChatbotAssignedSectionIds(chatbotId: string) {
  return fetchChatbotSectionIdsDefiner(chatbotId);
}

/** Student's enrolled section IDs that also have this chatbot assigned. */
export async function getStudentAccessSectionIds(
  studentId: string,
  chatbotId: string,
): Promise<string[]> {
  const enrolledIds = await fetchActiveSectionIdsForStudentDefiner(studentId);
  if (enrolledIds.length === 0) return [];
  const sections = await fetchSectionsByIds(enrolledIds);
  const enrolled = new Set(
    sections
      .filter((s) => !isSectionConcluded(s))
      .map((s) => s.id),
  );
  const assigned = await getChatbotAssignedSectionIds(chatbotId);
  return assigned.filter((id) => enrolled.has(id));
}

export async function studentCanAccessChatbot(
  studentId: string,
  chatbotId: string,
): Promise<boolean> {
  const sections = await getStudentAccessSectionIds(studentId, chatbotId);
  return sections.length > 0;
}

/** @deprecated Prefer userCanWriteChatbot with a full user actor. */
export async function professorOwnsOrTeachesChatbot(
  professorId: string,
  chatbotId: string,
): Promise<boolean> {
  const bot = await getActiveChatbot(chatbotId);
  if (!bot) return false;
  return userCanWriteChatbot({ id: professorId }, bot);
}

type ChatbotActor = Pick<UserData, 'id'> & {
  platformStaff?: boolean | null;
};

/**
 * Binding-based (Wave 2 item 11b): the actor must hold content.write on every
 * target section (inherited from offering/org bindings). `professor_sections`
 * is metadata only and confers no authority.
 */
export async function professorEnrolledInSections(
  user: ChatbotActor,
  sectionIds: string[],
): Promise<boolean> {
  for (const id of sectionIds) {
    if (!(await authorizeOnSection(user, 'content.write', id))) return false;
  }
  return true;
}

/**
 * Whether the actor may edit/assign/read-config a (non-template) chatbot:
 * content.write at its offering, or on any section it is assigned to, or
 * authorship combined with a teaching binding in the chatbot's tenant.
 */
export async function userCanWriteChatbot(
  user: ChatbotActor,
  bot: {
    id: string;
    professorId: string | null;
    tenantId: string | null;
    offeringId: string | null;
  },
): Promise<boolean> {
  if (bot.tenantId && bot.offeringId) {
    if (
      await authorize(user, 'content.write', {
        tenantId: bot.tenantId,
        scopeType: 'offering',
        scopeId: bot.offeringId,
      })
    ) {
      return true;
    }
  }
  const sectionIds = await getChatbotAssignedSectionIds(bot.id);
  for (const sectionId of sectionIds) {
    if (await authorizeOnSection(user, 'content.write', sectionId)) return true;
  }
  const authorId = bot.professorId;
  if (authorId && authorId === user.id && bot.tenantId) {
    return userHasAnyBinding(user.id, bot.tenantId, TEACHING_ROLES);
  }
  return false;
}

/** Load quiz stems only: strips correctAnswer and rubric. */
export async function loadSafeQuizForChatbot(
  relatedQuizId: string | null | undefined,
): Promise<SafeQuizInput | null> {
  if (!relatedQuizId) return null;

  const { fetchQuizById } = await import('@/lib/db/entityScopedReads');
  const { fetchQuizQuestionsSafeDefiner } = await import(
    '@/lib/db/studentWriteDefiners'
  );
  const quiz = await fetchQuizById(relatedQuizId);
  if (!quiz) return null;

  const qs = await fetchQuizQuestionsSafeDefiner(relatedQuizId);

  return {
    title: quiz.title,
    description: quiz.description,
    questions: qs.map((q) => ({
      order: q.order,
      type: q.type,
      question: q.question,
      options: Array.isArray(q.options) ? (q.options as string[]) : null,
    })),
  };
}

export async function professorCanLinkQuiz(
  user: ChatbotActor,
  quizId: string,
): Promise<boolean> {
  return professorCanAccessQuiz(user, quizId);
}
