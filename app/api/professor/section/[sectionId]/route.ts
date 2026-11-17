import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { apiErrorResponse } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { getProfessorSectionDetail } from '@/lib/professor/sections';
import { setSectionEndsAt } from '@/lib/professor/mutations';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';

/** Section detail (roster, codes, quizzes, discussions) for teaching faculty. */
export const GET = route<{ sectionId: string }>(
  { auth: { professorApi: 'read' } },
  async ({ params, apiAuth }) => {
    const auth = apiAuth!;

    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { sectionId } = params;
    const detail = await getProfessorSectionDetail(auth.user, sectionId);
    return NextResponse.json(detail);
  },
);

const patchSchema = z.object({
  endsAt: z.union([z.string(), z.null()]).optional(),
});

/**
 * Teaching professors (and admins) can set/clear section endsAt.
 */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ sectionId: string }> },
) {
  try {
    const { sectionId } = await context.params;
    const auth = await requireProfessorApi(req, { scope: 'sections:write' });
    const user = auth.user;

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation error', details: parsed.error.errors },
        { status: 400 },
      );
    }

    if (!('endsAt' in (body ?? {}))) {
      return NextResponse.json(
        { error: 'endsAt is required (ISO string or null to clear)' },
        { status: 400 },
      );
    }

    const updated = await setSectionEndsAt(
      user,
      sectionId,
      parsed.data.endsAt ?? null,
    );

    return NextResponse.json({
      success: true,
      section: {
        id: updated.id,
        endsAt: updated.endsAt,
      },
    });
  } catch (error) {
    console.error('Professor section PATCH error:', error);
    return apiErrorResponse(error);
  }
}
