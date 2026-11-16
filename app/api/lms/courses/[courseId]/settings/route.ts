import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingApi } from '@/lib/api/sessionAuth';
import { updateCourseLmsSettingsDefiner } from '@/lib/db/lmsDefiners';
import { assertCanManageCourse } from '@/lib/knowledge';
import { normalizeCourseNav } from '@/lib/lms/courseNav';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { courseId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const body = (await readJsonBody(req)) as {
      navigation?: unknown;
      syllabusMarkdown?: string | null;
    };
    const navigation =
      body.navigation !== undefined
        ? normalizeCourseNav(body.navigation)
        : undefined;
    const updated = await updateCourseLmsSettingsDefiner({
      courseId,
      navigation,
      syllabusMarkdown: body.syllabusMarkdown,
    });
    return NextResponse.json(updated);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
