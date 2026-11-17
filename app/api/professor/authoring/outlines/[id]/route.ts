import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import {
  archiveOutline,
  getOutlineDetail,
  listAuthoringMessages,
  restoreOutlineAsCurrent,
  updateOutlineMeta,
} from '@/lib/authoring/outlines';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(['DRAFT', 'READY', 'ARCHIVED']).optional(),
  /** Bring this outline back as the course's editable current draft. */
  restore: z.boolean().optional(),
});

export const GET = route<{ id: string }>(
  { auth: { professorApi: 'read' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const outline = await getOutlineDetail(auth.user, id);
    const includeMessages =
      req.nextUrl.searchParams.get('messages') === '1';
    const messages = includeMessages
      ? await listAuthoringMessages(auth.user, id)
      : undefined;
    return NextResponse.json({ outline, messages });
  },
);

export const PATCH = route<{ id: string }>(
  { auth: { professorApi: 'authoring:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-authoring-write:${auth.user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const body = patchSchema.parse(await req.json());
    if (body.restore) {
      const outline = await restoreOutlineAsCurrent(auth.user, id);
      const messages = await listAuthoringMessages(auth.user, id);
      return NextResponse.json({ outline, messages });
    }
    if (body.status === 'ARCHIVED' && body.title == null) {
      const archived = await archiveOutline(auth.user, id);
      return NextResponse.json({ outline: archived });
    }
    const outline = await updateOutlineMeta(auth.user, id, body);
    return NextResponse.json({ outline });
  },
);
