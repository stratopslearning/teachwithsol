import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { updateOutlineItem } from '@/lib/authoring/outlines';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  status: z.enum(['DRAFT', 'PREVIEW', 'PUBLISHED']).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export const PATCH = route<{ itemId: string }>(
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

    const { itemId } = params;
    const parsed = patchSchema.parse(await req.json());
    const item = await updateOutlineItem(auth.user, itemId, {
      title: parsed.title,
      status: parsed.status,
      body: parsed.body as Parameters<typeof updateOutlineItem>[2]['body'],
    });
    return NextResponse.json({ item });
  },
);
