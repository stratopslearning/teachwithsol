import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { unassignDiscussionFromSection } from '@/lib/professor/mutations';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const POST = route<{ sectionId: string; chatbotId: string }>(
  { auth: { professorApi: 'sections:write' } },
  async ({ params, user }) => {

    const limited = await enforceRateLimit({
      key: `chatbot-unassign:${user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
      message: 'Too many unassign requests. Please wait a moment.',
    });
    if (limited) return limited;

    const { sectionId, chatbotId } = params;
    await unassignDiscussionFromSection(user, sectionId, chatbotId);

    return NextResponse.json({ success: true });
  },
);
