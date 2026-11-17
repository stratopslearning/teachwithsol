import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { restoreDocumentVersionForUser } from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.object({
  versionId: z.string().uuid(),
});

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
    const body = bodySchema.parse(await req.json());
    await restoreDocumentVersionForUser(auth.user, id, body.versionId);
    return NextResponse.json({ success: true });
  },
);
