import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import { submitChapterSectionCheck } from '@/lib/lms/chapterProgress';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  sectionId: z.string().trim().min(1, 'sectionId is required'),
  answers: z.record(z.string()),
  moduleItemId: z.string().nullish(),
});

export const POST = route<{ id: string }, typeof bodySchema>(
  { auth: 'learner', body: bodySchema },
  async ({ params, user, body }) =>
    NextResponse.json(
      await submitChapterSectionCheck({
        studentId: user.id,
        lessonId: params.id,
        sectionId: body.sectionId,
        answers: body.answers,
        moduleItemId: body.moduleItemId ?? null,
      }),
    ),
);
