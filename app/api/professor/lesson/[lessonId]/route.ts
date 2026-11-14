import { NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingAccess } from '@/lib/authz/gates';
import { updateLesson } from '@/lib/learning/lessons';
import type { InteractiveChapterBody } from '@/lib/lms/interactiveChapter';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ lessonId: string }> },
) {
  try {
    const user = await requireTeachingAccess();
    const { lessonId } = await ctx.params;
    const body = (await readJsonBody(req)) as {
      title?: string;
      markdown?: string;
      chapter?: InteractiveChapterBody | null;
    };
    const updated = await updateLesson(user, lessonId, {
      title: body.title,
      markdown: body.markdown,
      chapter: body.chapter,
    });
    return NextResponse.json({
      lesson: {
        id: updated.id,
        title: updated.title,
        markdown: updated.markdown,
        chapter: updated.chapter,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
