import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '@/app/db';
import { attempts } from '@/app/db/schema';
import { fetchSectionById } from '@/lib/db/entityScopedReads';
import { withTenant } from '@/lib/db/tenantContext';
import { autoSubmitInProgressAttempt } from '@/lib/quiz/autoSubmit';
import { ApiError, apiErrorResponse } from '@/lib/api/errors';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { logQuizAttemptAudit } from '@/lib/audit';
import { loadExamContext, missingExamResource } from '@/lib/quiz/examContext';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { isStudentEntitled } from '@/lib/featureFlags';
import { assertQuizAccess, quizAccessError } from '@/lib/quiz/accessPolicy';
import { resolveAttemptSectionId } from '@/lib/quiz/attemptSection';
import { shouldForceAutoSubmitInProgress } from '@/lib/quiz/forceAutoSubmit';
import {
  getRemainingSeconds,
  isTimeLimitExceeded,
} from '@/lib/quiz/timeLimit';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const startBodySchema = z.object({
  assignmentId: z.string().uuid(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ quizId: string }> }) {
  const params = await context.params;
  const quizId = params.quizId;
  try {
    const user = await getOrCreateUser();
    if (!user) throw ApiError.unauthorized();
    if (!isStudentEntitled(user)) {
      throw ApiError.paymentRequired();
    }

    const limited = await enforceRateLimit({
      key: `start:${user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
      message: 'Too many quiz start requests. Please wait a moment.',
    });
    if (limited) return limited;

    const rawBody = await readJsonBody(req);
    const parseResult = startBodySchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw ApiError.badRequest('Invalid request body', parseResult.error.errors);
    }
    const { assignmentId } = parseResult.data;

    const ctx = await loadExamContext({
      quizId,
      assignmentId,
      studentId: user.id,
    });
    const missing = missingExamResource(ctx.assignment, ctx.quiz);
    if (missing === 'assignment') throw ApiError.notFound('Assignment not found');
    if (missing === 'quiz') throw ApiError.notFound('Quiz not found');
    const assignment = ctx.assignment!;
    const quiz = ctx.quiz!;
    // Before resume / auto-submit: an archived quiz takes no new work.
    if (!quiz.isActive) throw quizAccessError('archived', 'start');

    const now = new Date();
    const submittedCount = ctx.submittedCount;
    const inProgressAttempt = ctx.inProgressAttempt;

    if (inProgressAttempt) {
      const startedAtDate =
        inProgressAttempt.startedAt instanceof Date
          ? inProgressAttempt.startedAt
          : new Date(inProgressAttempt.startedAt);

      const { force } = shouldForceAutoSubmitInProgress({
        quiz,
        assignment,
        startedAt: startedAtDate,
        now,
      });

      if (force) {
        const autoResult = await autoSubmitInProgressAttempt(
          inProgressAttempt.id,
          now,
        );
        if (autoResult.submitted) {
          logQuizAttemptAudit({
            action: 'quiz.attempt.submit',
            actorUserId: user.id,
            actorClerkId: user.clerkId,
            attemptId: autoResult.attemptId,
            quizId,
            assignmentId,
            metadata: { serverAutoSubmitted: true },
            req,
          });
          return NextResponse.json({
            success: true,
            serverAutoSubmitted: true,
            attemptId: autoResult.attemptId,
            message: 'Your saved answers were submitted automatically.',
          });
        }
      }
    }

    const quizSectionIds = ctx.quizSectionLinks.map((qs) => qs.sectionId);
    const sectionId = await resolveAttemptSectionId(user.id, quizSectionIds);
    if (!sectionId) {
      throw ApiError.badRequest('No valid section found for this quiz/assignment');
    }

    // FORCE RLS: a plain db read returns no section, which silently skipped
    // the section-ended rule. Read it through the definer.
    const section = await fetchSectionById(sectionId);
    const tenantId = section?.tenantId ?? section?.workspaceId ?? null;
    assertQuizAccess(
      { quiz, assignment, section, inProgressAttempt, submittedCount, now },
      'start',
    );

    if (inProgressAttempt) {
      if (submittedCount >= quiz.maxAttempts) {
        const autoResult = await autoSubmitInProgressAttempt(
          inProgressAttempt.id,
          now,
        );
        if (autoResult.submitted) {
          logQuizAttemptAudit({
            action: 'quiz.attempt.submit',
            actorUserId: user.id,
            actorClerkId: user.clerkId,
            attemptId: autoResult.attemptId,
            quizId,
            assignmentId,
            metadata: { serverAutoSubmitted: true, maxAttemptsReached: true },
            req,
          });
          return NextResponse.json({
            success: true,
            serverAutoSubmitted: true,
            attemptId: autoResult.attemptId,
            message: 'Your in-progress attempt was submitted.',
          });
        }
        throw new ApiError({
          status: 400,
          message: `Maximum attempts (${quiz.maxAttempts}) reached for this quiz. You cannot retake this quiz.`,
          extras: { maxAttemptsReached: true },
        });
      }

      const timeLimitMinutes = quiz.timeLimit ?? null;
      const startedAtDate =
        inProgressAttempt.startedAt instanceof Date
          ? inProgressAttempt.startedAt
          : new Date(inProgressAttempt.startedAt);

      const remainingSeconds = getRemainingSeconds(
        timeLimitMinutes,
        startedAtDate,
        now,
      );
      const timeLimitExceeded =
        timeLimitMinutes != null &&
        isTimeLimitExceeded(timeLimitMinutes, startedAtDate, now);
      const forceAutoSubmit = shouldForceAutoSubmitInProgress({
        quiz,
        assignment,
        startedAt: startedAtDate,
        now,
      }).force;

      const savedAnswers =
        inProgressAttempt.answers &&
        typeof inProgressAttempt.answers === 'object' &&
        !Array.isArray(inProgressAttempt.answers)
          ? (inProgressAttempt.answers as Record<string, string>)
          : {};

      logQuizAttemptAudit({
        action: 'quiz.attempt.start',
        actorUserId: user.id,
        actorClerkId: user.clerkId,
        attemptId: inProgressAttempt.id,
        quizId,
        assignmentId,
        metadata: { resumed: true, forceAutoSubmit },
        req,
      });
      return NextResponse.json({
        success: true,
        attemptId: inProgressAttempt.id,
        startedAt: startedAtDate.toISOString(),
        answers: savedAnswers,
        timeLimitMinutes,
        remainingSeconds: remainingSeconds ?? null,
        timeLimitExceeded,
        forceAutoSubmit,
        resumed: true,
        message: forceAutoSubmit
          ? 'Time limit reached: submitting your saved answers now.'
          : 'Resuming existing attempt',
      });
    }

    if (submittedCount >= quiz.maxAttempts) {
      throw new ApiError({
        status: 400,
        message: `Maximum attempts (${quiz.maxAttempts}) reached for this quiz. You cannot retake this quiz.`,
        extras: { maxAttemptsReached: true },
      });
    }

    let attempt: {
      id: string;
      startedAt: Date | string;
      answers: unknown;
    };
    try {
      const { authorize } = await import('@/lib/authz');
      if (!tenantId) throw ApiError.badRequest('Section is missing tenant');
      const canSubmit = await authorize(user, 'student.submit', {
        tenantId,
        scopeType: 'section',
        scopeId: sectionId,
      });
      if (!canSubmit) {
        throw ApiError.forbidden('Not authorized to start this quiz');
      }

      const startResult = await db.execute(sql`
        SELECT sol_start_quiz_attempt(${JSON.stringify({
          assignmentId,
          studentId: user.id,
          quizId,
          sectionId,
        })}::jsonb) AS row
      `);
      const raw =
        (startResult as unknown as { rows?: Array<{ row: unknown }> }).rows?.[0]
          ?.row ??
        (Array.isArray(startResult)
          ? (startResult as Array<{ row: unknown }>)[0]?.row
          : null);
      const parsed =
        typeof raw === 'string'
          ? (JSON.parse(raw) as {
              id: string;
              startedAt: string;
              answers: unknown;
              resumed: boolean;
            })
          : (raw as {
              id: string;
              startedAt: string;
              answers: unknown;
              resumed: boolean;
            } | null);
      if (!parsed?.id) throw ApiError.internal('Failed to start quiz');
      attempt = {
        id: parsed.id,
        startedAt: parsed.startedAt,
        answers: parsed.answers,
      };
      if (parsed.resumed) {
        const startedAtDate = new Date(parsed.startedAt);
        const timeLimitMinutes = quiz.timeLimit ?? null;
        const remainingSeconds = getRemainingSeconds(
          timeLimitMinutes,
          startedAtDate,
          now,
        );
        const savedAnswers =
          parsed.answers &&
          typeof parsed.answers === 'object' &&
          !Array.isArray(parsed.answers)
            ? (parsed.answers as Record<string, string>)
            : {};
        logQuizAttemptAudit({
          action: 'quiz.attempt.start',
          actorUserId: user.id,
          actorClerkId: user.clerkId,
          attemptId: parsed.id,
          quizId,
          assignmentId,
          metadata: { resumed: true, concurrentInsert: true },
          req,
        });
        return NextResponse.json({
          success: true,
          attemptId: parsed.id,
          startedAt: startedAtDate.toISOString(),
          answers: savedAnswers,
          timeLimitMinutes,
          remainingSeconds: remainingSeconds ?? null,
          timeLimitExceeded:
            timeLimitMinutes != null &&
            isTimeLimitExceeded(timeLimitMinutes, startedAtDate, now),
          forceAutoSubmit: false,
          resumed: true,
          message: 'Resuming existing attempt',
        });
      }
    } catch (insertError) {
      if (insertError instanceof ApiError) throw insertError;
      // Unique open-attempt index (0007): a concurrent start won: resume it.
      // Read under the tenant: a plain db read returns nothing under FORCE RLS.
      // (tenantId is set here: without it the insert path threw ApiError above.)
      if (!tenantId) throw ApiError.internal('Failed to start quiz');
      const open = await withTenant(tenantId, user.id, (tx) =>
        tx.query.attempts.findFirst({
          where: and(
            eq(attempts.assignmentId, assignmentId),
            eq(attempts.studentId, user.id),
            isNull(attempts.submittedAt),
          ),
        }),
      );
      if (!open) {
        console.error('Error starting quiz (insert):', insertError);
        throw ApiError.internal('Failed to start quiz');
      }

      const startedAtDate =
        open.startedAt instanceof Date ? open.startedAt : new Date(open.startedAt);
      const timeLimitMinutes = quiz.timeLimit ?? null;
      const remainingSeconds = getRemainingSeconds(
        timeLimitMinutes,
        startedAtDate,
        now,
      );
      const savedAnswers =
        open.answers &&
        typeof open.answers === 'object' &&
        !Array.isArray(open.answers)
          ? (open.answers as Record<string, string>)
          : {};

      logQuizAttemptAudit({
        action: 'quiz.attempt.start',
        actorUserId: user.id,
        actorClerkId: user.clerkId,
        attemptId: open.id,
        quizId,
        assignmentId,
        metadata: { resumed: true, concurrentInsert: true },
        req,
      });
      return NextResponse.json({
        success: true,
        attemptId: open.id,
        startedAt: startedAtDate.toISOString(),
        answers: savedAnswers,
        timeLimitMinutes,
        remainingSeconds: remainingSeconds ?? null,
        timeLimitExceeded:
          timeLimitMinutes != null &&
          isTimeLimitExceeded(timeLimitMinutes, startedAtDate, now),
        forceAutoSubmit: shouldForceAutoSubmitInProgress({
          quiz,
          assignment,
          startedAt: startedAtDate,
          now,
        }).force,
        resumed: true,
        message: 'Resuming existing attempt',
      });
    }

    const startedAtDate =
      attempt.startedAt instanceof Date
        ? attempt.startedAt
        : new Date(attempt.startedAt);
    const timeLimitMinutes = quiz.timeLimit ?? null;
    const remainingSeconds = getRemainingSeconds(
      timeLimitMinutes,
      startedAtDate,
      now,
    );

    logQuizAttemptAudit({
      action: 'quiz.attempt.start',
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      attemptId: attempt.id,
      quizId,
      assignmentId,
      metadata: { resumed: false },
      req,
    });
    return NextResponse.json({
      success: true,
      attemptId: attempt.id,
      startedAt: startedAtDate.toISOString(),
      answers: {},
      timeLimitMinutes,
      remainingSeconds,
      timeLimitExceeded: false,
      forceAutoSubmit: false,
      resumed: false,
      message: 'Quiz started',
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
