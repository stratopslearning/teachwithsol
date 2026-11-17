import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { createSectionForCourse } from '@/lib/professor/createSection';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  courseId: z.string().uuid(),
  name: z.string().min(1).max(100),
  endsAt: z.union([z.string(), z.null()]).optional(),
});

/** Create a section in a workspace course; auto-enrolls the teaching professor. */
export const POST = route(
  { auth: { professorApi: 'sections:write', professorOnly: true } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-sections-write:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const body = bodySchema.parse(await req.json());
    const section = await createSectionForCourse(auth.user, {
      courseId: body.courseId,
      name: body.name,
      endsAt: body.endsAt,
    });
    return NextResponse.json({ success: true, section }, { status: 201 });
  },
);
