import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';
import { completionRequirementSchema } from '@/lib/lms/schemas';
import { addModuleItem } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

const createBody = z.object({
  title: z.string().optional(),
  type: z.string().optional(),
  isHeader: z.boolean().optional(),
  position: z.number().optional(),
  lessonId: z.string().optional(),
  quizId: z.string().optional(),
  chatbotId: z.string().optional(),
  interactiveId: z.string().optional(),
  pageId: z.string().optional(),
  peerDiscussionId: z.string().optional(),
  externalUrl: z.string().optional(),
  completionRequirement: completionRequirementSchema.optional(),
  published: z.boolean().optional(),
});

export const POST = route<{ courseId: string; moduleId: string }, typeof createBody>(
  { auth: 'manageCourse', body: createBody },
  async ({ params, body }) => {
    const item = await addModuleItem(params.moduleId, {
      title: body.title?.trim() || 'Item',
      type: body.type || (body.isHeader ? 'HEADER' : 'PAGE'),
      isHeader: Boolean(body.isHeader),
      position: body.position,
      lessonId: body.lessonId,
      quizId: body.quizId,
      chatbotId: body.chatbotId,
      interactiveId: body.interactiveId,
      pageId: body.pageId,
      peerDiscussionId: body.peerDiscussionId,
      externalUrl: body.externalUrl,
      completionRequirement: body.completionRequirement ?? null,
      published: body.published ?? true,
    });
    return NextResponse.json({ item });
  },
);
