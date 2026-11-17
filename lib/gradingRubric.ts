/**
 * Auto-derived per-question grading rubric.
 *
 * The rubric is the source of determinism: instead of asking the model "what
 * score?", we ask it "for each criterion, did the student match it?". The
 * final score is then computed in TypeScript via `computeScoreFromRubric`.
 *
 * Rubrics are cached on `questions.rubric` and invalidated by bumping
 * `questions.rubric_version` (done by the quiz update routes when the
 * question text or reference answer changes).
 */
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { withTenant } from '@/lib/db/tenantContext';
import { questions } from '@/app/db/schema';
import { aiClientFor, resolveModel } from '@/lib/ai/gateway';
import {
  buildRubricDesignerSystemPrompt,
  buildRubricDesignerUserPrompt,
} from '@/lib/ai/prompts/rubric';
import { defaultCoursePromptContext } from '@/lib/ai/prompts/courseContext';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { detectRequiredMatchCount } from '@/lib/gradingQuestionIntent';
import { GRADING_MODEL_VERSION, type RubricCriterion } from '@/lib/gradingTypes';

const RUBRIC_DERIVATION_TIMEOUT_MS = 20_000;


const rubricSchemaZod = z.object({
  criteria: z
    .array(
      z.object({
        description: z.string().min(3).max(240),
        weight: z.number().min(0.1).max(5).optional(),
        points: z.number().min(0.1).max(5).optional(),
        partialDescriptor: z.string().max(240).optional().nullable(),
        acceptableVariants: z.array(z.string().max(120)).max(8).optional(),
      }),
    )
    .min(1)
    .max(8),
  sampleAnswers: z
    .object({
      strong: z.string().min(1).max(2_000),
      partial: z.string().min(1).max(2_000),
      weak: z.string().min(1).max(2_000),
    })
    .optional(),
  needs_instructor_input: z.boolean().optional(),
});

const rubricJsonSchema = {
  type: 'object' as const,
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          weight: { type: 'number' },
          points: { type: 'number' },
          partialDescriptor: { type: 'string' },
          acceptableVariants: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['description'],
        additionalProperties: false,
      },
    },
    sampleAnswers: {
      type: 'object',
      properties: {
        strong: { type: 'string' },
        partial: { type: 'string' },
        weak: { type: 'string' },
      },
      required: ['strong', 'partial', 'weak'],
      additionalProperties: false,
    },
    needs_instructor_input: { type: 'boolean' },
  },
  required: ['criteria'],
  additionalProperties: false,
};

/** Normalize `points` ↔ `weight` and optional v2 fields. */
export function normalizeRubricCriterion(
  raw: Record<string, unknown>,
  index: number,
): RubricCriterion | null {
  const id =
    typeof raw.id === 'string' && raw.id.trim()
      ? raw.id.trim()
      : `c${index + 1}`;
  const description =
    typeof raw.description === 'string' ? raw.description.trim() : '';
  if (!description) return null;
  const weightRaw =
    typeof raw.weight === 'number'
      ? raw.weight
      : typeof raw.points === 'number'
        ? raw.points
        : 1;
  const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 1;
  const criterion: RubricCriterion = {
    id,
    description,
    weight,
    points: weight,
  };
  if (typeof raw.partialDescriptor === 'string' && raw.partialDescriptor.trim()) {
    criterion.partialDescriptor = raw.partialDescriptor.trim();
  }
  if (Array.isArray(raw.acceptableVariants)) {
    const variants = raw.acceptableVariants
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim())
      .slice(0, 8);
    if (variants.length > 0) criterion.acceptableVariants = variants;
  }
  return criterion;
}

function isValidRubric(value: unknown): value is RubricCriterion[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every((c) => {
    if (!c || typeof c !== 'object') return false;
    const row = c as Record<string, unknown>;
    const hasWeight =
      typeof row.weight === 'number' || typeof row.points === 'number';
    return (
      typeof row.id === 'string' &&
      typeof row.description === 'string' &&
      hasWeight
    );
  });
}

export function readRubricFromColumn(value: unknown): RubricCriterion[] | null {
  if (!isValidRubric(value)) return null;
  const normalized = (value as Record<string, unknown>[])
    .map((row, i) => normalizeRubricCriterion(row, i))
    .filter((c): c is RubricCriterion => c != null);
  return normalized.length > 0 ? normalized : null;
}

/**
 * Compute the final integer score from rubric matches.
 *
 * Score = round((Σ weight × matchedFactor) / Σ weight × maxPoints), clamped
 * to [0, maxPoints]. `matched` contributes 1.0 × weight; `partial && !matched`
 * contributes 0.5 × weight.
 *
 * When `requiredMatchCount` is set and less than the rubric length, criteria
 * are treated as an option pool: only the top N achieved values count toward
 * the score (any-N / "list any two" questions).
 *
 * Empty rubric or zero weights ⇒ 0. Out-of-rubric `criterionId` values from
 * the model are silently ignored (we score only criteria we control).
 */
export function computeScoreFromRubric(
  rubric: RubricCriterion[],
  matches: { criterionId: string; matched: boolean; partial?: boolean }[],
  maxPoints: number,
  options?: { requiredMatchCount?: number | null },
): number {
  if (rubric.length === 0 || maxPoints <= 0) return 0;

  const matchById = new Map<string, { matched: boolean; partial?: boolean }>();
  for (const match of matches) {
    matchById.set(match.criterionId, match);
  }

  const requiredMatchCount = options?.requiredMatchCount ?? null;
  const useTopN =
    requiredMatchCount != null &&
    requiredMatchCount > 0 &&
    requiredMatchCount < rubric.length;

  if (useTopN) {
    const achieved = rubric.map((criterion) => {
      const weight = Math.max(criterion.weight, 0);
      const match = matchById.get(criterion.id);
      let value = 0;
      if (match?.matched) {
        value = weight;
      } else if (match?.partial) {
        value = weight * 0.5;
      }
      return { weight, value };
    });

    const topN = [...achieved]
      .sort((a, b) => b.value - a.value)
      .slice(0, requiredMatchCount);

    const topWeight = topN.reduce((sum, row) => sum + row.weight, 0);
    if (topWeight <= 0) return 0;

    const topValue = topN.reduce((sum, row) => sum + row.value, 0);
    const raw = (topValue / topWeight) * maxPoints;
    const rounded = Math.round(raw);
    return Math.min(Math.max(rounded, 0), maxPoints);
  }

  const totalWeight = rubric.reduce(
    (sum, c) => sum + Math.max(c.weight, 0),
    0,
  );
  if (totalWeight <= 0) return 0;

  let weighted = 0;
  for (const criterion of rubric) {
    const weight = Math.max(criterion.weight, 0);
    const match = matchById.get(criterion.id);
    if (!match) continue;
    if (match.matched) {
      weighted += weight;
    } else if (match.partial) {
      weighted += weight * 0.5;
    }
  }

  const raw = (weighted / totalWeight) * maxPoints;
  const rounded = Math.round(raw);
  return Math.min(Math.max(rounded, 0), maxPoints);
}

export class RubricDerivationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RubricDerivationError';
  }
}

export type RubricModelResult = {
  criteria: RubricCriterion[];
  sampleAnswers?: { strong: string; partial: string; weak: string };
  needsInstructorInput?: boolean;
};

export async function callRubricModel(
  question: string,
  correctAnswer: string,
  opts?: { courseCtx?: ReturnType<typeof defaultCoursePromptContext>; totalPoints?: number },
): Promise<RubricCriterion[]> {
  const full = await callRubricModelFull(question, correctAnswer, opts);
  return full.criteria;
}

export async function callRubricModelFull(
  question: string,
  correctAnswer: string,
  opts?: { courseCtx?: ReturnType<typeof defaultCoursePromptContext>; totalPoints?: number },
): Promise<RubricModelResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new RubricDerivationError('no_api_key');
  }

  const requiredCount = detectRequiredMatchCount(question);
  const ctx = opts?.courseCtx ?? defaultCoursePromptContext();
  const system = buildRubricDesignerSystemPrompt(ctx, {
    minCriteria: requiredCount ?? 3,
    maxCriteria: requiredCount != null ? Math.max(requiredCount + 2, 6) : 6,
    totalPoints: opts?.totalPoints ?? 1,
  });
  const user = buildRubricDesignerUserPrompt(question, correctAnswer);
  const anyNNote =
    requiredCount != null
      ? `\nANY-N: produce one criterion per distinct valid answer point (option pool). Use weight/points 1 for every criterion.`
      : '';

  const model = resolveModel('rubric').model;
  const supportsReasoningEffort =
    /^gpt-5/i.test(model) || /^o\d/i.test(model) || /reasoning/i.test(model);
  // Per call (was a module-level client). No tenant in scope here, so the
  // workspace budget isn't reserved for rubric derivation.
  const openai = await aiClientFor(
    'rubric',
    {},
    { maxRetries: 2, timeout: RUBRIC_DERIVATION_TIMEOUT_MS },
  );
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: `${user}${anyNNote}` },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'grading_rubric',
        strict: false,
        schema: rubricJsonSchema,
      },
    },
    ...(supportsReasoningEffort ? { reasoning_effort: 'low' as const } : {}),
    max_completion_tokens: 1200,
    seed: 7,
  } as never);

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new RubricDerivationError('empty_response');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new RubricDerivationError('invalid_json');
  }

  const validated = rubricSchemaZod.safeParse(parsed);
  if (!validated.success) {
    throw new RubricDerivationError('schema_validation_failed');
  }

  const criteria = validated.data.criteria
    .map((c, index) =>
      normalizeRubricCriterion(
        {
          description: c.description,
          weight: c.weight,
          points: c.points,
          partialDescriptor: c.partialDescriptor,
          acceptableVariants: c.acceptableVariants,
        },
        index,
      ),
    )
    .filter((c): c is RubricCriterion => c != null);

  if (criteria.length === 0) {
    throw new RubricDerivationError('schema_validation_failed');
  }

  return {
    criteria,
    sampleAnswers: validated.data.sampleAnswers,
    needsInstructorInput: validated.data.needs_instructor_input,
  };
}

/**
 * Build a single-criterion fallback rubric that simply asks "does this answer
 * match the reference?". Used when rubric derivation fails so grading can
 * still proceed deterministically (single weight-1 criterion).
 */
export function fallbackRubric(): RubricCriterion[] {
  return [
    {
      id: 'c1',
      description:
        'The student answer fully matches the reference answer: includes all of the reference answer\'s key concepts, terminology, and accuracy with no significant inaccuracies or omissions.',
      weight: 1,
    },
  ];
}

type GetOrDeriveResult = {
  rubric: RubricCriterion[];
  rubricVersion: number;
  /** True when this call generated and persisted a new rubric. */
  derived: boolean;
  /** True when we fell back to the synthetic single-criterion rubric. */
  fallback?: boolean;
};

type QuestionRow = {
  id: string;
  question: string;
  correctAnswer: string | null;
  rubric: unknown;
  rubricVersion: number;
  /** Needed to persist a derived rubric under FORCE RLS. */
  tenantId?: string | null;
};

/**
 * Return the question's rubric. Prefer an already-authored rubric.
 * Deriving + persisting at first grade is fallback-only (logged).
 * Never throws: failures degrade to a minimal fallback rubric.
 */
export async function getOrDeriveRubric(
  question: QuestionRow,
): Promise<GetOrDeriveResult> {
  const existing = readRubricFromColumn(question.rubric);
  if (existing) {
    return {
      rubric: existing,
      rubricVersion: question.rubricVersion,
      derived: false,
    };
  }

  console.warn(
    '[rubric] derive-at-grade fallback — prefer approve-at-authoring',
    { questionId: question.id },
  );

  const correctAnswer = (question.correctAnswer ?? '').trim();
  if (!correctAnswer) {
    return {
      rubric: fallbackRubric(),
      rubricVersion: question.rubricVersion,
      derived: false,
      fallback: true,
    };
  }

  try {
    const rubric = await callRubricModel(question.question, correctAnswer);
    void logAiSpan(
      'deriveRubric',
      'rubric',
      {
        model: GRADING_MODEL_VERSION,
        questionIdHash: hashId(question.id),
        criterionCount: rubric.length,
        status: 'derived',
      },
      { isFailure: false },
    );
    try {
      // FORCE RLS: a plain update matched no rows, so derived rubrics were
      // never saved and were re-derived (an AI call) on every grade.
      if (question.tenantId) {
        const tenantId = question.tenantId;
        await withTenant(tenantId, null, (tx) =>
          tx.update(questions).set({ rubric }).where(eq(questions.id, question.id)),
        );
      }
    } catch (writeErr) {
      console.warn('rubric persist failed (continuing without cache):', writeErr);
    }
    return {
      rubric,
      rubricVersion: question.rubricVersion,
      derived: true,
    };
  } catch (error) {
    console.warn('rubric derivation failed; using fallback:', error);
    void logAiSpan(
      'deriveRubric',
      'rubric',
      {
        model: GRADING_MODEL_VERSION,
        questionIdHash: hashId(question.id),
        status: 'fallback',
        error: error instanceof Error ? error.message : String(error),
      },
      { isFailure: true },
    );
    return {
      rubric: fallbackRubric(),
      rubricVersion: question.rubricVersion,
      derived: false,
      fallback: true,
    };
  }
}

/** Synchronous variant used when the caller has the rubric in hand. */
export function ensureRubric(value: unknown): RubricCriterion[] {
  const existing = readRubricFromColumn(value);
  return existing ?? fallbackRubric();
}
