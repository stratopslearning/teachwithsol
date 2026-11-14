import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { studentCanAccessChatbot } from '@/lib/chatbot/access';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { isStudentEntitled } from '@/lib/featureFlags';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import {
  completeChatbotSessionDefiner,
  fetchChatbotSessionByIdDefiner,
} from '@/lib/db/studentWriteDefiners';
import { getOrCreateUser } from '@/lib/getOrCreateUser';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sessionId: z.string().uuid(),
});

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
      key: `chatbot-complete:${user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { chatbotId } = await context.params;
    const body = bodySchema.parse(await readJsonBody(req));

    const canAccess = await studentCanAccessChatbot(user.id, chatbotId);
    if (!canAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const session = await fetchChatbotSessionByIdDefiner(
      body.sessionId,
      user.id,
      chatbotId,
    );

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const completed = await completeChatbotSessionDefiner(
      session.id,
      user.id,
    );
    if (!completed) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.sectionId) {
      const { enqueueCompletionPassback } = await import('@/lib/lti/passback');
      void enqueueCompletionPassback({
        ref: { chatbotId },
        studentId: user.id,
        sectionId: session.sectionId,
        completed: true,
      }).catch((err) =>
        console.error('LTI discussion completion passback failed', err),
      );
    }

    void (async () => {
      try {
        const section = session.sectionId
          ? await fetchSectionById(session.sectionId)
          : null;
        const { tagSessionStruggles } = await import(
          '@/lib/chatbot/struggleTagger'
        );
        await tagSessionStruggles({
          sessionId: session.id,
          studentId: user.id,
          courseId: section?.courseId,
        });
      } catch (err) {
        console.warn('[chatbot/complete] struggle tagger failed', err);
      }
    })();

    return NextResponse.json({
      success: true,
      sessionId: completed.id,
      status: completed.status,
    });
  } catch (error) {
    console.error('Chatbot complete error:', error);
    return NextResponse.json(
      { error: 'Failed to complete discussion' },
      { status: 500 },
    );
  }
}
