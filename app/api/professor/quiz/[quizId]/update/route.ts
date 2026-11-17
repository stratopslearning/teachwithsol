import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError, apiErrorResponse, jsonError } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { updateQuiz } from '@/lib/professor/mutations';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { quizUpdateSchema } from '@/lib/quizSchemas';

export const dynamic = 'force-dynamic';

const updateQuizSchema = quizUpdateSchema;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  try {
    const { quizId } = await params;
    const { user } = await requireProfessorApi(req, { scope: 'quizzes:write' });

    const limited = await enforceRateLimit({
      key: `quiz-update:${user.id}`,
      limit: 60,
      windowMs: 60_000,
      prefix: 'rl',
      message: 'Too many quiz update requests. Please wait a moment.',
    });
    if (limited) return limited;

    const body = await readJsonBody(req);
    const validatedData = updateQuizSchema.parse(body);

    const quiz = await updateQuiz(user, quizId, {
      title: validatedData.title,
      description: validatedData.description,
      sectionIds: validatedData.sectionIds,
      maxAttempts: validatedData.maxAttempts,
      timeLimit: validatedData.timeLimit,
      passingScore: validatedData.passingScore,
      startDate: validatedData.startDate,
      endDate: validatedData.endDate,
      isActive: validatedData.isActive,
      hideFeedbackAfterDue: validatedData.hideFeedbackAfterDue,
      questions: validatedData.questions.map((q) => ({
        id: q.id,
        type: q.type,
        question: q.question,
        options: q.options,
        correctAnswer: q.correctAnswer,
        points: q.points,
        order: q.order,
      })),
    });

    return NextResponse.json({
      success: true,
      message: 'Quiz updated successfully',
      quiz,
    });
  } catch (error) {
    console.error('Quiz update error:', error);
    if (error instanceof ApiError) return jsonError(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 },
      );
    }
    return apiErrorResponse(error);
  }
}
