import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { fetchQuizById } from '@/lib/db/entityScopedReads';
import { ApiError, jsonError } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { extractRequestMeta, logAudit } from '@/lib/audit';
import { professorCanAccessQuiz } from '@/lib/quizAccess';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  /** ISO timestamp or null to unrelease. Omit to release now. */
  gradesReleasedAt: z.union([z.string().datetime(), z.null()]).optional(),
});

/**
 * Explicit grade release for a quiz. Students only see scores/overrides after
 * `quizzes.grades_released_at` is set and in the past.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  try {
    const { quizId } = await params;
    const { user } = await requireProfessorApi(req, { scope: 'grades:write' });

    const limited = await enforceRateLimit({
      key: `quiz-release-grades:${user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
    });
    if (limited) return limited;

    const canAccess = await professorCanAccessQuiz(user, quizId);
    if (!canAccess) throw ApiError.forbidden('Not allowed to manage this quiz');

    // FORCE RLS: a plain db read finds no quiz (release always 404'd).
    const quiz = await fetchQuizById(quizId);
    if (!quiz) throw ApiError.notFound('Quiz not found');
    if (quiz.tenantId) {
      const { requireWorkspaceTeaching } = await import(
        '@/lib/workspace/entitlement'
      );
      await requireWorkspaceTeaching(quiz.tenantId, user);
    }

    const raw = await readJsonBody(req).catch(() => ({}));
    const parsed = bodySchema.safeParse(raw ?? {});
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: parsed.error.errors },
        { status: 400 },
      );
    }

    const releasedAt =
      parsed.data.gradesReleasedAt === undefined
        ? new Date()
        : parsed.data.gradesReleasedAt === null
          ? null
          : new Date(parsed.data.gradesReleasedAt);

    const { setQuizGradesReleasedDefiner } = await import(
      '@/lib/db/tenantWriteDefiners'
    );
    const updated = await setQuizGradesReleasedDefiner(quizId, releasedAt);

    const meta = extractRequestMeta(req);
    await logAudit({
      actorUserId: user.id,
      action: releasedAt
        ? 'education.grades.release'
        : 'education.grades.unrelease',
      targetType: 'quiz',
      targetId: quizId,
      metadata: {
        gradesReleasedAt: releasedAt?.toISOString() ?? null,
      },
      ...meta,
    });

    return NextResponse.json({
      success: true,
      quizId: updated.id,
      gradesReleasedAt: updated.gradesReleasedAt,
    });
  } catch (error) {
    console.error('Error releasing grades:', error);
    if (error instanceof ApiError) return jsonError(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: 'Failed to release grades' },
      { status: 500 },
    );
  }
}
