import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingApi } from '@/lib/api/sessionAuth';
import { assertCanManageCourse } from '@/lib/knowledge';
import { addModuleItem } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ courseId: string; moduleId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { courseId, moduleId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const body = (await readJsonBody(req)) as {
      title?: string;
      type?: string;
      isHeader?: boolean;
      position?: number;
      lessonId?: string;
      quizId?: string;
      chatbotId?: string;
      interactiveId?: string;
      pageId?: string;
      peerDiscussionId?: string;
      externalUrl?: string;
      completionRequirement?: {
        type: 'view' | 'submit' | 'score_at_least';
        minPercent?: number;
      };
      published?: boolean;
    };
    const item = await addModuleItem(moduleId, {
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
  } catch (error) {
    return apiErrorResponse(error);
  }
}
