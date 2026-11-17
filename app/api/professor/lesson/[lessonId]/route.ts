import { NextResponse } from 'next/server';

import { readJsonBody } from '@/lib/api/readJsonBody';
import { updateLesson } from '@/lib/learning/lessons';
import type { InteractiveChapterBody } from '@/lib/lms/interactiveChapter';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

export const PATCH = route<{ lessonId: string }>(
  { auth: 'teaching' },
  async ({ req, params, user }) => {
    const { lessonId } = params;
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
  },
);
