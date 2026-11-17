import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import {
  listAuthoringRevisions,
  restoreAuthoringRevision,
} from '@/lib/authoring/revisions';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const restoreSchema = z.object({
  revisionId: z.string().uuid(),
});

export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { id } = params;
    const revisions = await listAuthoringRevisions(auth.user, id);
    return NextResponse.json({ revisions });
  },
);

export const POST = route<{ id: string }>(
  { auth: { professorApi: 'authoring:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-authoring-write:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    params; // outline id validated via revision ownership
    const body = restoreSchema.parse(await req.json());
    const outline = await restoreAuthoringRevision(
      auth.user,
      body.revisionId,
    );
    return NextResponse.json({ outline });
  },
);
