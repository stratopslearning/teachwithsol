/**
 * Live rubric designer eval — callRubricModel on synthetic short-answer fixtures.
 */
import { callRubricModelFull } from '@/lib/grading/rubric';
import type { RubricEvalCase } from '@/evals/datasets/rubric';

export type RubricEvalOutput = {
  criteriaCount: number;
  minCriteria: number;
  maxCriteria: number;
  hasDescriptions: boolean;
};

export async function runRubricEval(
  input: RubricEvalCase,
): Promise<RubricEvalOutput> {
  const full = await callRubricModelFull(input.question, input.correctAnswer);
  const criteria = full.criteria ?? [];
  return {
    criteriaCount: criteria.length,
    minCriteria: input.minCriteria,
    maxCriteria: input.maxCriteria,
    hasDescriptions: criteria.every(
      (c) => typeof c.description === 'string' && c.description.trim().length > 0,
    ),
  };
}
