import type { ChatbotMessage } from '@/app/db/schema';
import {
  getStudentAccessSectionIds,
  studentCanAccessChatbot,
} from '@/lib/chatbot/access';
import { fetchChatbotByIdDefiner } from '@/lib/db/studentReadDefiners';
import { loadOrCreateChatbotSessionDefiner } from '@/lib/db/studentWriteDefiners';

export type StudentChatbotPageData = {
  session: {
    id: string;
    status: 'in_progress' | 'completed';
    messages: ChatbotMessage[];
    isCompleted: boolean;
  };
  chatbot: {
    id: string;
    title: string;
    description: string | null;
    personaName: string;
    instructions: string;
    relatedQuizId: string | null;
    learningMode: boolean;
  };
};

/** Access check (enrollment ∩ assignment) via DEFINER helpers. */
export async function studentHasChatbotAccess(
  studentId: string,
  chatbotId: string,
): Promise<boolean> {
  return studentCanAccessChatbot(studentId, chatbotId);
}

/**
 * Load everything the chat UI needs in one server round.
 * Prefer `sessionId` for reviews; otherwise resume in-progress or latest completed.
 */
export async function loadStudentChatbotPageData(opts: {
  studentId: string;
  chatbotId: string;
  sessionId?: string;
}): Promise<StudentChatbotPageData | null> {
  const bot = await fetchChatbotByIdDefiner(opts.chatbotId);
  if (!bot || !bot.isActive || bot.isTemplate) return null;

  const canAccess = await studentHasChatbotAccess(opts.studentId, opts.chatbotId);
  if (!canAccess) return null;

  let sectionId: string | null = null;
  if (!opts.sessionId) {
    const accessSections = await getStudentAccessSectionIds(
      opts.studentId,
      opts.chatbotId,
    );
    sectionId = accessSections[0] ?? null;
  }

  const loaded = await loadOrCreateChatbotSessionDefiner({
    chatbotId: opts.chatbotId,
    studentId: opts.studentId,
    sessionId: opts.sessionId ?? null,
    sectionId,
  });
  if (!loaded?.assignment || !loaded.session) return null;

  const messages = Array.isArray(loaded.session.messages)
    ? (loaded.session.messages as ChatbotMessage[])
    : [];

  return {
    session: {
      id: loaded.session.id,
      status: loaded.session.status as 'in_progress' | 'completed',
      messages,
      isCompleted:
        loaded.assignment.isCompleted || loaded.session.status === 'completed',
    },
    chatbot: {
      id: bot.id,
      title: bot.title,
      description: bot.description,
      personaName: bot.personaName,
      instructions: bot.instructions,
      relatedQuizId: bot.relatedQuizId,
      learningMode: Boolean(bot.relatedQuizId),
    },
  };
}
