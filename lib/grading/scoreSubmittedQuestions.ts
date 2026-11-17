import { outcomeToFeedback, resolveMaterialsContext, type StoredFeedback } from '@/lib/grading';
import {
  cachedPayloadToFeedback,
  hashMaterialsContext,
  lookupCachedGrading,
} from '@/lib/grading/cache';
import { readRubricFromColumn } from '@/lib/grading/rubric';
import { GRADING_MODEL_VERSION } from '@/lib/grading/types';
import { getCourseWorkspaceId } from '@/lib/workspace';

export type ScoreableQuestion = {
  id: string;
  type: 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER';
  question: string;
  correctAnswer: string | null;
  points: number;
  rubric: unknown;
  rubricVersion: number | null;
};

export type ScoredSubmission = {
  totalScore: number;
  maxScore: number;
  gptFeedback: Record<string, StoredFeedback>;
  pendingQuestionIds: string[];
};

/**
 * In-process scoring for submit. MCQ/TF and empty short answers are final.
 * Short answers with a stored rubric hit `grading_cache` inline when materials
 * context can be resolved without OpenAI. Unique answers (or missing rubric) are
 * marked pending for background retry.
 */
export async function scoreSubmittedQuestions(
  quizQuestions: ScoreableQuestion[],
  answers: Record<string, string>,
  opts?: { courseId?: string | null },
): Promise<ScoredSubmission> {
  let totalScore = 0;
  let maxScore = 0;
  const gptFeedback: Record<string, StoredFeedback> = {};
  const pendingQuestionIds: string[] = [];
  const courseId = opts?.courseId ?? null;
  const tenantId = courseId ? await getCourseWorkspaceId(courseId) : null;

  for (const question of quizQuestions) {
    const userAnswer = answers[question.id];

    if (!userAnswer || userAnswer.trim?.() === '') {
      maxScore += question.points;
      if (question.type === 'SHORT_ANSWER') {
        gptFeedback[question.id] = {
          score: 0,
          feedback: 'Please read the textbook and try again.',
          confidence: 100,
          maxPoints: question.points,
          status: 'graded',
        };
      }
      continue;
    }

    if (question.type === 'MULTIPLE_CHOICE' || question.type === 'TRUE_FALSE') {
      maxScore += question.points;
      if (userAnswer === question.correctAnswer) {
        totalScore += question.points;
      }
      continue;
    }

    if (question.type !== 'SHORT_ANSWER') continue;

    const storedRubric = readRubricFromColumn(question.rubric);
    if (storedRubric) {
      let materialsContextHash = '';
      if (courseId) {
        const materialsContext = await resolveMaterialsContext({
          courseId,
          question: question.question,
        });
        materialsContextHash = hashMaterialsContext(materialsContext);
      }
      const cached = await lookupCachedGrading({
        questionId: question.id,
        studentAnswer: userAnswer,
        rubricVersion: question.rubricVersion ?? 1,
        modelVersion: GRADING_MODEL_VERSION,
        tenantId: tenantId ?? undefined,
        materialsContextHash,
      });
      if (cached) {
        maxScore += question.points;
        totalScore += cached.score;
        gptFeedback[question.id] = {
          ...cachedPayloadToFeedback(cached),
          maxPoints: question.points,
          attempts: 1,
        };
        continue;
      }
    }

    pendingQuestionIds.push(question.id);
    gptFeedback[question.id] = outcomeToFeedback({
      status: 'pending',
      failureReason: 'unknown',
      maxPoints: question.points,
      feedback:
        'Grading is queued. Our system will finish reviewing this answer shortly. Your score on this question is not finalized yet.',
    });
  }

  return { totalScore, maxScore, gptFeedback, pendingQuestionIds };
}
