import { NextRequest, NextResponse } from 'next/server';

import { apiErrorResponse } from '@/lib/api/errors';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { requireTeachingApi } from '@/lib/api/sessionAuth';
import { assertCanManageCourse } from '@/lib/knowledge';
import { listTeachableSectionIdsForCourse } from '@/lib/authoring/access';
import { createModule, listModulesWithItems } from '@/lib/lms/modules';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ courseId: string }> },
) {
  try {
    const user = await requireTeachingApi();
    const { courseId } = await ctx.params;
    await assertCanManageCourse(user, courseId);
    const modules = await listModulesWithItems(courseId);
    return NextResponse.json({ modules });
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
    const body = (await readJsonBody(req)) as {
      title?: string;
      published?: boolean;
    };
    const sectionIds = await listTeachableSectionIdsForCourse(user, courseId);
    const mod = await createModule({
      courseId,
      title: body.title?.trim() || 'New module',
      published: Boolean(body.published),
      sectionIds,
    });
    return NextResponse.json({ module: mod });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
