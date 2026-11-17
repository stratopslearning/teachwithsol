import { NextResponse } from 'next/server';
import { z } from 'zod';

import { readJsonBody } from '@/lib/api/readJsonBody';
import {
  analyzeUnitInsights,
  listUnitInsights,
} from '@/lib/insights/analyzeUnit';
import { assertCanManageCourse } from '@/lib/knowledge/access';
import { getCourseWorkspaceId } from '@/lib/workspace';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const postSchema = z.object({
  outlineId: z.string().uuid().optional(),
  moduleId: z.string().uuid().optional(),
  quizIds: z.array(z.string().uuid()).optional(),
});

export const GET = route<{ courseId: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;
    const { courseId } = params;
    await assertCanManageCourse(auth.user, courseId);
    const tenantId = await getCourseWorkspaceId(courseId);
    if (!tenantId) {
      return NextResponse.json({ insights: [] });
    }
    const insights = await listUnitInsights({ tenantId, courseId });
    return NextResponse.json({ insights });
  },
);

export const POST = route<{ courseId: string }>(
  { auth: { professorApi: 'authoring:write' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { courseId } = params;
    await assertCanManageCourse(auth.user, courseId);
    const tenantId = await getCourseWorkspaceId(courseId);
    if (!tenantId) {
      return NextResponse.json(
        { error: 'Course workspace not found' },
        { status: 400 },
      );
    }
    const body = postSchema.parse(await readJsonBody(req));
    const row = await analyzeUnitInsights({
      tenantId,
      courseId,
      outlineId: body.outlineId,
      moduleId: body.moduleId,
      quizIds: body.quizIds,
    });
    return NextResponse.json({ insight: row });
  },
);
