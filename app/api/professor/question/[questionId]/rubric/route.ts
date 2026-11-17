import { NextResponse } from 'next/server';
import { z } from 'zod';

import { ApiError } from '@/lib/api/errors';
import { userCanWriteQuiz } from '@/lib/quiz/access';
import { readJsonBody } from '@/lib/api/readJsonBody';
import {
  approveQuestionRubric,
  loadQuestionForActor,
  proposeQuestionRubric,
  testRubricSampleSeparation,
} from '@/lib/authoring/rubricApprove';
import { route } from '@/lib/api/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const sampleSchema = z.object({
  band: z.enum(['good', 'partial', 'bad']),
  answer: z.string().min(1).max(8_000),
});

const postSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('propose') }),
  z.object({
    action: z.literal('test'),
    samples: z.array(sampleSchema).min(3).max(6),
  }),
  z.object({
    action: z.literal('approve'),
    samples: z.array(sampleSchema).min(3).max(6).optional(),
  }),
]);

export const POST = route<{ questionId: string }>(
  { auth: { professorApi: 'grades:write' } },
  async ({ req, params, apiAuth }) => {
    const auth = apiAuth!;
    const { questionId } = params;
    const body = postSchema.parse(await readJsonBody(req));

    // Only teachers who can edit the question's quiz may change its rubric
    // (previously any professor token could act on any question id).
    const { question } = await loadQuestionForActor(questionId, auth.user.id);
    if (!(await userCanWriteQuiz(auth.user, question.quizId))) {
      throw ApiError.forbidden('You do not have access to this question');
    }

    if (body.action === 'propose') {
      const result = await proposeQuestionRubric({
        questionId,
        actorUserId: auth.user.id,
      });
      return NextResponse.json(result);
    }
    if (body.action === 'test') {
      const result = await testRubricSampleSeparation({
        questionId,
        actorUserId: auth.user.id,
        samples: body.samples,
      });
      return NextResponse.json(result);
    }
    const result = await approveQuestionRubric({
      questionId,
      actorUserId: auth.user.id,
      samples: body.samples,
    });
    return NextResponse.json(result);
  },
);
