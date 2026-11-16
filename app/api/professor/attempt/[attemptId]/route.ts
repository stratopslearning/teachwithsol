import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';


import { apiErrorResponse, ApiError } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { getAttemptDetail } from '@/lib/professor/grading';
import { insertGradeOverride } from '@/lib/professor/overrides';
import { assertTeachesSection } from '@/lib/professor/sections';
import { loadAttemptForGrading } from '@/lib/quiz/gradingData';

export const dynamic = 'force-dynamic';

const patchBodySchema = z.object({
  questionId: z.string().uuid().optional().nullable(),
  numericScore: z.number().int().optional().nullable(),
  criteriaOverrides: z.record(z.boolean()).optional().nullable(),
  note: z.string().min(1),
});

/** Full attempt detail (answers + AI feedback): audited disclosure. */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const auth = await requireProfessorApi(req, { scope: 'read' });

    const limited = await enforceRateLimit({
      key: `professor-read:${auth.user.id}`,
      limit: 120,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { attemptId } = await context.params;
    const attempt = await getAttemptDetail(auth.user, attemptId);
    return NextResponse.json({ attempt });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

/** Manual grade override (numeric and/or rubric criteria) with required note. */
export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ attemptId: string }> },
) {
  try {
    const auth = await requireProfessorApi(req, { scope: 'grades:write' });

    const limited = await enforceRateLimit({
      key: `professor-grade-write:${auth.user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const { attemptId } = await context.params;
    // FORCE RLS: a plain db read finds no attempt; look it up via the definer.
    const attemptRow = await loadAttemptForGrading(attemptId);
    if (!attemptRow) throw ApiError.notFound('Attempt not found');
    await assertTeachesSection(auth.user, attemptRow.sectionId);

    const rawBody = await req.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { override, effective } = await insertGradeOverride({
      attemptId,
      questionId: parsed.data.questionId ?? null,
      numericScore: parsed.data.numericScore,
      criteriaOverrides: parsed.data.criteriaOverrides ?? null,
      note: parsed.data.note,
      actorUserId: auth.user.id,
    });

    const { ip, userAgent } = extractRequestMeta(req);
    await logAudit({
      actorUserId: auth.user.id,
      actorClerkId: auth.user.clerkId,
      action: 'education.grade.override',
      targetType: 'attempt',
      targetId: attemptId,
      metadata: {
        overrideId: override.id,
        questionId: override.questionId,
        numericScore: override.numericScore,
        criteriaOverrides: override.criteriaOverrides,
        effectiveScore: effective.totalScore,
        effectivePercentage: effective.percentage,
      },
      ip,
      userAgent,
    });

    const attempt = await getAttemptDetail(auth.user, attemptId);
    return NextResponse.json({ attempt, override, effective });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
