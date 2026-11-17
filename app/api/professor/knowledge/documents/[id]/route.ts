import { NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import {
  listVersionsForUser,
  reprocessDocumentForUser,
  shareDocumentToLibrary,
  softDeleteKnowledgeDocument,
} from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const versions = await listVersionsForUser(auth.user, id);
    return NextResponse.json({ versions });
  },
);

export const DELETE = route<{ id: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-knowledge-write:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;
    const { id } = params;
    await softDeleteKnowledgeDocument(auth.user, id);
    return NextResponse.json({ success: true });
  },
);

/** Reprocess current version, or share personal → library. */
export const POST = route<{ id: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-knowledge-write:${auth.user.id}`,
      limit: 20,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;
    const { id } = params;
    const action = req.nextUrl.searchParams.get('action') ?? 'reprocess';
    if (action === 'reprocess') {
      await reprocessDocumentForUser(auth.user, id);
      return NextResponse.json({ success: true });
    }
    if (action === 'share') {
      const document = await shareDocumentToLibrary(auth.user, id);
      return NextResponse.json({ document });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  },
);
