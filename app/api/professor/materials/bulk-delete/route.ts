import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { softDeleteMaterials } from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  courseId: z.string().uuid(),
  materialIds: z.array(z.string().uuid()).min(1).max(500),
});

export const POST = route(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-materials-write:${auth.user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const body = bodySchema.parse(await req.json());
    const meta = extractRequestMeta(req);
    const result = await softDeleteMaterials(
      auth.user,
      { courseId: body.courseId, materialIds: body.materialIds },
      meta,
    );
    return NextResponse.json(result);
  },
);
