import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { requireApiUser } from '@/lib/api/sessionAuth';
import { assertStudentCanAccessInteractive } from '@/lib/interactives/access';
import { upsertInteractiveProgress } from '@/lib/interactives/mutations';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser();
    const { id } = await ctx.params;
    await assertStudentCanAccessInteractive(user, id);
    const body = await req.json();
    const status = body.status === 'COMPLETED' ? 'COMPLETED' : 'STARTED';
    const row = await upsertInteractiveProgress({
      interactiveId: id,
      studentId: user.id,
      status,
      xapiSummary: body.xapiSummary ?? null,
    });
    return NextResponse.json({ progress: row });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
