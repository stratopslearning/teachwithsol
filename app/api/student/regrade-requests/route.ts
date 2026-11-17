import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import { createRegradeRequest } from '@/lib/regradeRequests';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  attemptId: z.string().uuid(),
  note: z.string().min(1).max(2000),
});

export const POST = route<Record<string, string>, typeof bodySchema>(
  { auth: 'learningArea', body: bodySchema },
  async ({ user, body }) => {
    const row = await createRegradeRequest({
      attemptId: body.attemptId,
      studentId: user.id,
      note: body.note,
    });
    return NextResponse.json({ request: row }, { status: 201 });
  },
);
