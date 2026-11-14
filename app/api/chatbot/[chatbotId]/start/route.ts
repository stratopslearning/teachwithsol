import { NextRequest, NextResponse } from 'next/server';

import type { ChatbotMessage } from '@/app/db/schema';
import {
  getActiveChatbot,
  getStudentAccessSectionIds,
} from '@/lib/chatbot/access';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import { loadOrCreateChatbotSessionDefiner } from '@/lib/db/studentWriteDefiners';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { isStudentEntitled } from '@/lib/featureFlags';
import {
  isSectionConcluded,
  SECTION_CONCLUDED_MESSAGE,
} from '@/lib/sectionAvailability';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ chatbotId: string }> },
) {
  try {
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isStudentEntitled(user)) {
      return NextResponse.json({ error: 'Payment required' }, { status: 402 });
    }

    const limited = await enforceRateLimit({
      key: `chatbot-start:${user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { chatbotId } = await context.params;
    const body = await req.json().catch(() => ({} as { sessionId?: string }));
    const requestedSessionId =
      typeof body?.sessionId === 'string' ? body.sessionId : undefined;

    const bot = await getActiveChatbot(chatbotId);
    if (!bot || bot.isTemplate) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const accessSections = await getStudentAccessSectionIds(user.id, chatbotId);
    const sectionId = accessSections[0] ?? null;

    if (requestedSessionId) {
      const loaded = await loadOrCreateChatbotSessionDefiner({
        chatbotId,
        studentId: user.id,
        sessionId: requestedSessionId,
      });
      if (!loaded?.assignment || !loaded.session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }
      return NextResponse.json({
        session: {
          id: loaded.session.id,
          assignmentId: loaded.assignment.id,
          status: loaded.session.status,
          messages: (loaded.session.messages as ChatbotMessage[]) ?? [],
          isCompleted:
            loaded.assignment.isCompleted ||
            loaded.session.status === 'completed',
        },
        chatbot: serializeBot(bot),
      });
    }

    if (!sectionId) {
      // Allow resume/review when all access sections concluded.
      const resume = await loadOrCreateChatbotSessionDefiner({
        chatbotId,
        studentId: user.id,
        sectionId: null,
      });
      if (resume?.assignment && resume.session) {
        return NextResponse.json({
          session: {
            id: resume.session.id,
            assignmentId: resume.assignment.id,
            status: resume.session.status,
            messages: (resume.session.messages as ChatbotMessage[]) ?? [],
            isCompleted:
              resume.assignment.isCompleted ||
              resume.session.status === 'completed',
          },
          chatbot: serializeBot(bot),
        });
      }
      return NextResponse.json(
        { error: SECTION_CONCLUDED_MESSAGE, sectionConcluded: true },
        { status: 403 },
      );
    }

    const section = await fetchSectionById(sectionId);
    if (isSectionConcluded(section)) {
      return NextResponse.json(
        { error: SECTION_CONCLUDED_MESSAGE, sectionConcluded: true },
        { status: 400 },
      );
    }

    const loaded = await loadOrCreateChatbotSessionDefiner({
      chatbotId,
      studentId: user.id,
      sectionId,
    });
    if (!loaded?.assignment || !loaded.session) {
      return NextResponse.json(
        { error: 'Unable to start discussion' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      session: {
        id: loaded.session.id,
        assignmentId: loaded.assignment.id,
        status: loaded.session.status,
        messages: (loaded.session.messages as ChatbotMessage[]) ?? [],
        isCompleted:
          loaded.assignment.isCompleted ||
          loaded.session.status === 'completed',
      },
      chatbot: serializeBot(bot),
    });
  } catch (error) {
    console.error('Chatbot start error:', error);
    return NextResponse.json(
      { error: 'Failed to start discussion' },
      { status: 500 },
    );
  }
}

function serializeBot(bot: {
  id: string;
  title: string;
  description: string | null;
  personaName: string;
  instructions: string;
  relatedQuizId: string | null;
}) {
  return {
    id: bot.id,
    title: bot.title,
    description: bot.description,
    personaName: bot.personaName,
    instructions: bot.instructions,
    relatedQuizId: bot.relatedQuizId,
    learningMode: Boolean(bot.relatedQuizId),
  };
}
