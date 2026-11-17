import { NextResponse } from 'next/server';
import { z } from 'zod';

import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { setMaterialAuthoringCorpus } from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

const schema = z.object({
  authoringCorpus: z.enum(['prior_course', 'this_term']),
});

export const PATCH = route<{ id: string }>(
  { auth: { professorApi: 'materials:write', professorOnly: true } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-materials-write:${auth.user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { id } = params;
    const body = schema.parse(await req.json());
    const material = await setMaterialAuthoringCorpus(
      auth.user,
      id,
      body.authoringCorpus,
    );
    return NextResponse.json({ material });
  },
);
