import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse, ApiError } from '@/lib/api/errors';
import { requireLearnerApi } from '@/lib/api/sessionAuth';
import { submitChapterSectionCheck } from '@/lib/lms/chapterProgress';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireLearnerApi();
    const { id: lessonId } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      sectionId?: string;
      answers?: Record<string, string>;
      moduleItemId?: string | null;
    };

    if (!body.sectionId?.trim()) {
      throw ApiError.badRequest('sectionId is required');
    }
    if (!body.answers || typeof body.answers !== 'object') {
      throw ApiError.badRequest('answers are required');
    }

    const result = await submitChapterSectionCheck({
      studentId: user.id,
      lessonId,
      sectionId: body.sectionId.trim(),
      answers: body.answers,
      moduleItemId: body.moduleItemId ?? null,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
