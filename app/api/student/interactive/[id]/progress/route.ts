import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import { assertStudentCanAccessInteractive } from '@/lib/interactives/access';
import { upsertInteractiveProgress } from '@/lib/interactives/mutations';

const bodySchema = z.object({
  status: z.string().optional(),
  xapiSummary: z.record(z.unknown()).nullish(),
});

export const POST = route<{ id: string }, typeof bodySchema>(
  { auth: 'user', body: bodySchema },
  async ({ params, user, body }) => {
    await assertStudentCanAccessInteractive(user, params.id);
    const row = await upsertInteractiveProgress({
      interactiveId: params.id,
      studentId: user.id,
      status: body.status === 'COMPLETED' ? 'COMPLETED' : 'STARTED',
      xapiSummary: body.xapiSummary ?? null,
    });
    return NextResponse.json({ progress: row });
  },
);
