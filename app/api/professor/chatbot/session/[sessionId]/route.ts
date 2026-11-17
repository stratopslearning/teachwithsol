import { NextResponse } from 'next/server';

import { getDiscussionSession } from '@/lib/professor/discussions';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const GET = route<{ sessionId: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { sessionId } = params;
    const session = await getDiscussionSession(auth.user, sessionId);
    return NextResponse.json({ session });
  },
);
