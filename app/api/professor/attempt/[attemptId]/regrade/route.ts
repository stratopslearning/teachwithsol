import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError, jsonError } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { authorizeOnSection } from '@/lib/authz/courseAccess';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { regradeAttempt } from '@/lib/grading/regradeAttempt';
import { loadAttemptForGrading } from '@/lib/quiz/gradingData';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const bodySchema = z.object({
  fallbackOnly: z.boolean().optional().default(true),
});

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  try {
    const { attemptId } = await params;
    const { user } = await requireProfessorApi(_req, { scope: 'grades:write' });

    // Individual re-grades are a professor action with a built-in cost ceiling
    // (each call hits OpenAI). 60 per 5 minutes is plenty for clearing a
    // backlog one-at-a-time while still preventing accidental loops. Bulk
    // re-grades go through /api/professor/attention/regrade-all which has its
    // own (lower) bucket.
    const limited = await enforceRateLimit({
      key: `regrade:${user.id}`,
      limit: 60,
      windowMs: 5 * 60_000,
      prefix: 'rl',
      message: 'Too many re-grade requests. Please wait a moment and try again.',
    });
    if (limited) return limited;

    const rawBody = await _req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.errors },
        { status: 400 },
      );
    }

    // FORCE RLS: a plain db read finds no attempt; look it up via the definer.
    const attempt = await loadAttemptForGrading(attemptId);

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    if (!attempt.submittedAt) {
      return NextResponse.json(
        { error: 'Only submitted attempts can be re-graded' },
        { status: 400 },
      );
    }

    if (
      !(await authorizeOnSection(user, 'regrade.resolve', attempt.sectionId))
    ) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const result = await regradeAttempt(attemptId, {
      fallbackOnly: parsed.data.fallbackOnly,
    });

    const { ip, userAgent } = extractRequestMeta(_req);
    await logAudit({
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      action: 'education.attempt.regrade',
      targetType: 'attempt',
      targetId: attemptId,
      metadata: {
        fallbackOnly: parsed.data.fallbackOnly,
        regradedQuestionCount: result.regradedQuestionCount,
        pendingQuestionCount: result.pendingQuestionCount,
        score: result.score,
        gradingStatus: result.gradingStatus,
      },
      ip,
      userAgent,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Re-grade attempt error:', error);
    if (error instanceof ApiError) return jsonError(error);
    if (error instanceof Error && error.message === 'Attempt not found') {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (
      error instanceof Error &&
      error.message === 'Only submitted attempts can be re-graded'
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Failed to re-grade attempt' },
      { status: 500 },
    );
  }
}
