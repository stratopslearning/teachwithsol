import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorResponse } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta } from '@/lib/audit';
import { generateCourseOutline } from '@/lib/authoring/generate';
import {
  getCurrentOutlineForCourse,
  listOutlinesForCourse,
} from '@/lib/authoring/outlines';
import { proposeOutlineSkeleton } from '@/lib/authoring/propose';
import { listTeachableCourses } from '@/lib/knowledge';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
/** Skeleton + faithful build of every assignment can exceed 2 minutes. */
export const maxDuration = 300;

const generateSchema = z.object({
  courseId: z.string().uuid(),
  brief: z.string().max(2000).optional(),
  /** propose = outline + full assignment bodies; oneshot = legacy full generate. */
  mode: z.enum(['propose', 'oneshot']).optional().default('propose'),
  /** Optional focus set; omit/empty = full Ready corpus. */
  materialIds: z.array(z.string().uuid()).max(40).optional(),
});

/** List outlines for a course, or teachable courses when courseId omitted. */
export const GET = route(
  { auth: { professorApi: 'read' } },
  async ({ req, apiAuth }) => {
    const auth = apiAuth!;
    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const courseId = req.nextUrl.searchParams.get('courseId');
    if (!courseId) {
      const courses = await listTeachableCourses(auth.user);
      return NextResponse.json({ courses });
    }

    const current = req.nextUrl.searchParams.get('current') === '1';
    if (current) {
      const outline = await getCurrentOutlineForCourse(auth.user, courseId);
      return NextResponse.json({ outline });
    }

    const includeArchived =
      req.nextUrl.searchParams.get('includeArchived') === '1';
    const outlines = await listOutlinesForCourse(auth.user, courseId, {
      includeArchived,
    });
    return NextResponse.json({ outlines });
  },
);

/** Propose outline + build assignment bodies, or legacy oneshot generate. */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireProfessorApi(req, {
      scope: 'authoring:write',
      professorOnly: true,
    });
    const limited = await enforceRateLimit({
      key: `professor-authoring-write:${auth.user.id}`,
      limit: 10,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const body = generateSchema.parse(await req.json());
    const meta = extractRequestMeta(req);
    const outline =
      body.mode === 'oneshot'
        ? await generateCourseOutline(
            auth.user,
            { courseId: body.courseId, brief: body.brief },
            meta,
          )
        : await proposeOutlineSkeleton(
            auth.user,
            {
              courseId: body.courseId,
              brief: body.brief,
              materialIds: body.materialIds,
            },
            meta,
          );
    return NextResponse.json({ outline }, { status: 201 });
  } catch (error) {
    console.error('[authoring/outlines POST]', error);
    return apiErrorResponse(error);
  }
}
