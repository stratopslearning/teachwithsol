import { NextResponse } from 'next/server';

import { listDiscussionSessions } from '@/lib/professor/discussions';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const sessions = await listDiscussionSessions(auth.user, id);
    return NextResponse.json({ sessions });
  },
);
