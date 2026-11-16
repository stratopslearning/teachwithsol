import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingApi } from '@/lib/api/sessionAuth';
import {
  listCourseRubricsDefiner,
  upsertCourseRubricDefiner,
} from '@/lib/db/lmsDefiners';
import { assertCanManageCourse } from '@/lib/knowledge';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { courseId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    return NextResponse.json({
      rubrics: await listCourseRubricsDefiner(courseId),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { courseId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const body = (await readJsonBody(req)) as Record<string, unknown>;
    const rubric = await upsertCourseRubricDefiner({ ...body, courseId });
    return NextResponse.json({ rubric });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
