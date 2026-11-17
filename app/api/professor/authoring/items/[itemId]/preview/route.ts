import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { previewOutlineItem } from '@/lib/authoring/preview';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    mode: z.enum(['faculty', 'student']).optional(),
  })
  .optional();

export const POST = route<{ itemId: string }>(
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
    let mode: 'faculty' | 'student' = 'faculty';
    try {
      const json = await req.json();
      const parsed = bodySchema.parse(json);
      if (parsed?.mode) mode = parsed.mode;
    } catch {
      // empty body OK
    }
    const result = await previewOutlineItem(auth.user, itemId, { mode });
    return NextResponse.json(result);
  },
);
