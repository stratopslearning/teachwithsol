import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { setLessonVisibility } from '@/lib/learning/lessons';

export const dynamic = 'force-dynamic';

export async function POST(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  try {
    const user = await requireTeachingAccess();
    const { lessonId } = await ctx.params;
    const body = (await readJsonBody(req)) as { isActive?: boolean };
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive boolean required' },
        { status: 400 },
      );
    }
    const updated = await setLessonVisibility(user, lessonId, body.isActive);
    return NextResponse.json({ lesson: updated });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
