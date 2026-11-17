import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError, apiErrorResponse } from '@/lib/api/errors';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { tenantRateLimitKey } from '@/lib/rateLimit';
import {
  QUIZ_ANSWERS_JSON_MAX_BYTES,
  readJsonBody,
} from '@/lib/api/readJsonBody';
import { sanitizeAnswerRecord } from '@/lib/api/sanitizeStoredText';
import { logQuizAttemptAudit } from '@/lib/audit';
import { loadExamContext } from '@/lib/quiz/examContext';
import { executeQuizSubmit } from '@/lib/quiz/submit';
import { getOrCreateUser } from '@/lib/getOrCreateUser';
import { isStudentEntitled } from '@/lib/featureFlags';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_ANSWER_LENGTH = 10_000;
const submitBodySchema = z.object({
  assignmentId: z.string().uuid(),
  answers: z.record(z.string().max(MAX_ANSWER_LENGTH)),
  autoSubmitted: z.boolean().optional().default(false),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ quizId: string }> },
) {
  const params = await context.params;
  const quizId = params.quizId;

  try {
    const user = await getOrCreateUser();
    if (!user) throw ApiError.unauthorized();
    if (!isStudentEntitled(user)) {
      throw ApiError.paymentRequired();
    }

    const rawBody = await readJsonBody(req, {
      maxBytes: QUIZ_ANSWERS_JSON_MAX_BYTES,
    });
    const parseResult = submitBodySchema.safeParse(rawBody);
    if (!parseResult.success) {
      throw ApiError.badRequest('Invalid request body', parseResult.error.errors);
    }
    const { assignmentId, answers, autoSubmitted } = parseResult.data;

    const examCtx = await loadExamContext({
      quizId,
      assignmentId,
      studentId: user.id,
      includeSections: false,
      includeSubmittedAttempts: false,
    });
    const limited = await enforceRateLimit({
      key: tenantRateLimitKey(examCtx.assignment?.tenantId, user.id, 'submit'),
      limit: 30,
      windowMs: 5 * 60_000,
      prefix: 'rl',
      message: 'Too many quiz submissions. Please wait a moment and try again.',
    });
    if (limited) return limited;

    const sanitizedAnswers = sanitizeAnswerRecord(answers);

    // autoSubmitted is client telemetry only: never grants availability/timer bypass.
    const result = await executeQuizSubmit({
      quizId,
      assignmentId,
      studentId: user.id,
      answers: sanitizedAnswers,
      autoSubmitted,
      bypassAvailability: false,
    });

    logQuizAttemptAudit({
      action: 'quiz.attempt.submit',
      actorUserId: user.id,
      actorClerkId: user.clerkId,
      attemptId: result.attemptId,
      quizId,
      assignmentId,
      metadata: {
        autoSubmitted,
        gradingStatus: result.gradingStatus,
      },
      req,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    // Access-policy failures (archived, window, section ended, attempts,
    // time limit) are ApiErrors already; only plain not-found errors map here.
    if (error instanceof Error && !(error instanceof ApiError)) {
      if (
        error.message === 'Quiz not found' ||
        error.message === 'Assignment not found'
      ) {
        return apiErrorResponse(ApiError.notFound(error.message));
      }
    }
    return apiErrorResponse(error);
  }
}
