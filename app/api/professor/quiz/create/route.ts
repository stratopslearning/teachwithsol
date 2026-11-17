import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError, jsonError } from '@/lib/api/errors';
import { requireProfessorApi } from '@/lib/api/professorAuth';
import { enforceRateLimit } from '@/lib/api/rateLimitGuard';
import { readJsonBody } from '@/lib/api/readJsonBody';
import { createQuiz } from '@/lib/professor/mutations';
import { quizCreateBaseSchema } from '@/lib/quiz/schemas';

export const dynamic = 'force-dynamic';

const createQuizSchema = quizCreateBaseSchema;

export async function POST(req: NextRequest) {
  try {
    const { user } = await requireProfessorApi(req, {
      scope: 'quizzes:write',
      professorOnly: true,
    });

    const limited = await enforceRateLimit({
      key: `quiz-create:${user.id}`,
      limit: 30,
      windowMs: 60_000,
      prefix: 'rl',
      message: 'Too many quiz create requests. Please wait a moment.',
    });
    if (limited) return limited;

    const body = await readJsonBody(req);
    const validatedData = createQuizSchema.parse(body);

    const newQuiz = await createQuiz(user, validatedData);

    return NextResponse.json({
      success: true,
      quiz: {
        id: newQuiz.id,
        title: newQuiz.title,
        sectionIds: newQuiz.sectionIds,
      },
    });
  } catch (error) {
    console.error('Quiz creation error:', error);
    if (error instanceof ApiError) return jsonError(error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid data', details: error.errors },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'Failed to create quiz' }, { status: 500 });
  }
}
