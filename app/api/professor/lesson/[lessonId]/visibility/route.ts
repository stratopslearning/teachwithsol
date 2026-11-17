import { NextResponse } from 'next/server';

import { readJsonBody } from '@/lib/api/readJsonBody';
import { setLessonVisibility } from '@/lib/learning/lessons';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const POST = route<{ lessonId: string }>(
  { auth: 'teaching' },
  async ({ req, params, user }) => {
    const { lessonId } = params;
    const body = (await readJsonBody(req)) as { isActive?: boolean };
    if (typeof body.isActive !== 'boolean') {
      return NextResponse.json(
        { error: 'isActive boolean required' },
        { status: 400 },
      );
    }
    const updated = await setLessonVisibility(user, lessonId, body.isActive);
    return NextResponse.json({ lesson: updated });
  },
);
