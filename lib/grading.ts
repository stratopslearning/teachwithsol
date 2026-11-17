/**
 * Deterministic rubric-based grading with smart model routing, structured
 * outputs, evidence quote verification, and dual-run review escalation.
 */
import { aiClientFor, resolveModel } from '@/lib/ai/gateway';
import { minimizeStudentTextForAi } from '@/lib/ai/minimizeEducationPayload';
import {
  buildGraderSystemPrompt,
  buildGraderUserPrompt,
  formatRubricForGraderPrompt,
} from '@/lib/ai/prompts/grader';
import {
  defaultCoursePromptContext,
  loadCoursePromptContext,
  type CoursePromptContext,
} from '@/lib/ai/prompts/courseContext';
import { completeJsonSchema } from '@/lib/ai/structured';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { z } from 'zod';
import {
  hashMaterialsContext,
  lookupCachedGrading,
  writeCachedGrading,
  type CachedGradingPayload,
} from '@/lib/gradingCache';
import {
  applyEvidenceChecks,
  classifyStudentAnswerSpecial,
  matchesDisagree,
} from '@/lib/gradingEvidence';
import {
  buildSafeMaterialsContext,
  retrieveCourseChunks,
} from '@/lib/knowledge';
import { detectRequiredMatchCount } from '@/lib/gradingQuestionIntent';
import {
  computeScoreFromRubric,
  ensureRubric,
  fallbackRubric,
} from '@/lib/gradingRubric';
import {
  GRADING_CONFIDENCE_REVIEW_THRESHOLD,
  GRADING_MODEL_VERSION,
  GRADING_PROMPT_VERSION,
  MAX_FEEDBACK_LENGTH,
  type FailureReason,
  type RubricCriterion,
  type RubricMatch,
  type StoredFeedback,
} from '@/lib/gradingTypes';

export {
  GRADING_MODEL_VERSION,
  GRADING_PROMPT_VERSION,
  MAX_FEEDBACK_LENGTH,
  type FailureReason,
  type RubricCriterion,
  type RubricMatch,
  type StoredFeedback,
} from '@/lib/gradingTypes';
export { computeScoreFromRubric } from '@/lib/gradingRubric';

const MAX_FIELD_LENGTH = 8_000;

export interface GradingRequest {
  question: string;
  studentAnswer: string;
  correctAnswer?: string;
  maxPoints: number;
  questionType: 'SHORT_ANSWER';
  questionId?: string;
  rubric?: RubricCriterion[];
  rubricVersion?: number;
  courseId?: string;
  workspaceId?: string;
  materialsContext?: string;
  /** Few-shot override examples (already delimited); injected into the prompt. */
  overrideExamples?: string;
}

export const GRADING_MATERIALS_CHAR_BUDGET = 2_000;

export function formatMaterialsGradingSection(materialsContext: string): string {
  const trimmed = materialsContext.trim();
  if (!trimmed) return '';
  return `
COURSE MATERIALS (terminology only: do NOT award credit from materials alone; the REFERENCE ANSWER remains the only scoring standard):
${truncate(trimmed, GRADING_MATERIALS_CHAR_BUDGET)}
`;
}

export async function resolveMaterialsContext(
  request: Pick<GradingRequest, 'materialsContext' | 'courseId' | 'question'>,
): Promise<string> {
  if (request.materialsContext != null) {
    return request.materialsContext.trim();
  }
  if (!request.courseId) return '';
  try {
    // FORCE RLS: a plain db read finds no course (materials context was
    // always empty). Use the definer.
    const { fetchCourseById } = await import('@/lib/db/entityScopedReads');
    const course = await fetchCourseById(request.courseId);
    const tenantId = course?.tenantId ?? course?.workspaceId;
    if (!tenantId) return '';
    const chunks = await retrieveCourseChunks(
      request.courseId,
      request.question,
      { k: 4, tenantId },
    );
    return buildSafeMaterialsContext(chunks, GRADING_MATERIALS_CHAR_BUDGET);
  } catch (err) {
    console.warn('[grading] materials context skipped', err);
    return '';
  }
}

type GradedOutcome = {
  status: 'graded';
  score: number;
  feedback: string;
  confidence: number;
  rubric: RubricCriterion[];
  rubricMatches: RubricMatch[];
  modelVersion: string;
  rubricVersion: number;
  maxPoints: number;
  requiredMatchCount?: number | null;
  cached?: boolean;
  promptVersion?: string;
  aiTask?: string;
  modelTier?: string;
};

type PendingOutcome = {
  status: 'pending';
  failureReason: FailureReason;
  maxPoints: number;
  feedback: string;
  message?: string;
};

/** Promoted to instructor review (not auto-scored). */
type ManualReviewOutcome = {
  status: 'manual_review';
  failureReason: FailureReason;
  maxPoints: number;
  feedback: string;
  confidence: number;
  rubric: RubricCriterion[];
  rubricMatches: RubricMatch[];
  modelVersion: string;
  rubricVersion: number;
  promptVersion?: string;
  aiTask?: string;
  modelTier?: string;
  message?: string;
};

export type GradingOutcome =
  | GradedOutcome
  | PendingOutcome
  | ManualReviewOutcome;

export interface GradingResponse {
  score: number;
  feedback: string;
  confidence?: number;
}

function truncate(value: string, max: number = MAX_FIELD_LENGTH): string {
  if (!value) return value;
  return value.length > max ? value.slice(0, max) : value;
}

function trimFeedback(text: string, max: number = MAX_FEEDBACK_LENGTH): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  const slice = collapsed.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice).trim() + '…';
}

function pendingPlaceholderFeedback(reason: FailureReason): string {
  switch (reason) {
    case 'missing_reference_answer':
      return 'Grading unavailable: reference answer not provided. Please contact your instructor.';
    case 'no_api_key':
      return 'Grading is queued. Our system is processing your answer and will update this question shortly.';
    case 'ai_band_exceeded':
      return 'Grading is paused while this organization reaches its AI usage limit. Your instructor has been notified.';
    case 'low_confidence':
    case 'run_disagreement':
      return 'This answer was sent for instructor review. Your score on this question is not finalized yet.';
    default:
      return 'Grading is queued. Our system will finish reviewing this answer shortly. Your score on this question is not finalized yet.';
  }
}

const gradingResponseZod = z.object({
  criteria: z
    .array(
      z.object({
        criterionId: z.string().min(1).max(40),
        status: z.enum(['met', 'partial', 'not_met']),
        evidenceQuote: z.string().max(800).optional().nullable(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(20),
  feedback: z.string().min(1).max(4_000),
  classification: z.enum(['ok', 'blank', 'off_topic', 'injection']),
});

type GradingResponseShape = z.infer<typeof gradingResponseZod>;

/** Internal shape after mapping status → matched/partial and confidence 0–1 → 0–100. */
type MappedGradingResponse = {
  rubricMatches: GradingResponseShape['criteria'];
  feedback: string;
  confidence: number;
  classification: GradingResponseShape['classification'];
};

const gradingJsonSchema = {
  type: 'object' as const,
  properties: {
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          criterionId: { type: 'string' },
          status: { type: 'string', enum: ['met', 'partial', 'not_met'] },
          evidenceQuote: { type: 'string' },
          confidence: { type: 'number' },
        },
        required: ['criterionId', 'status', 'evidenceQuote', 'confidence'],
        additionalProperties: false,
      },
    },
    feedback: { type: 'string' },
    classification: {
      type: 'string',
      enum: ['ok', 'blank', 'off_topic', 'injection'],
    },
  },
  required: ['criteria', 'feedback', 'classification'],
  additionalProperties: false,
};

/** Model 0–1 → store 0–100. */
export function confidenceToStored(c: number): number {
  if (!Number.isFinite(c)) return 0;
  if (c <= 1) return Math.round(Math.min(1, Math.max(0, c)) * 100);
  return Math.round(Math.min(100, Math.max(0, c)));
}

function overallConfidenceFromCriteria(
  criteria: GradingResponseShape['criteria'],
): number {
  if (criteria.length === 0) return 0;
  const sum = criteria.reduce((acc, row) => acc + (row.confidence ?? 0), 0);
  return confidenceToStored(sum / criteria.length);
}

/** Exported for unit tests. */
export function buildGradingPrompt(
  request: GradingRequest,
  rubric: RubricCriterion[],
  requiredMatchCount: number | null,
  materialsContext = '',
): string {
  const studentAnswer = minimizeStudentTextForAi(request.studentAnswer);
  const anyNNote =
    requiredMatchCount != null && requiredMatchCount < rubric.length
      ? `ANY-N: The student needs ANY ${requiredMatchCount} of the criteria for full credit. Evaluate each independently; do not criticize missing optional criteria.`
      : undefined;

  const examples = request.overrideExamples?.trim()
    ? request.overrideExamples
        .trim()
        .split(/\n{2,}/)
        .map((block) => `<example>\n${block.trim()}\n</example>`)
        .join('\n')
    : undefined;

  return buildGraderUserPrompt({
    question: truncate(request.question),
    referenceAnswer: truncate(request.correctAnswer ?? ''),
    rubricXml: formatRubricForGraderPrompt(rubric),
    materials: materialsContext
      ? truncate(materialsContext, GRADING_MATERIALS_CHAR_BUDGET)
      : undefined,
    examples,
    studentAnswer: truncate(studentAnswer),
    anyNNote,
  });
}

function fillMissingMatches(
  rubric: RubricCriterion[],
  modelMatches: GradingResponseShape['criteria'],
): RubricMatch[] {
  const byId = new Map<string, RubricMatch>();
  for (const m of modelMatches) {
    const status = m.status;
    const matched = status === 'met';
    const partial = status === 'partial';
    byId.set(m.criterionId, {
      criterionId: m.criterionId,
      matched,
      partial: partial && !matched ? true : undefined,
      evidenceQuote: m.evidenceQuote
        ? m.evidenceQuote.slice(0, 200)
        : undefined,
      evidence: m.evidenceQuote ? m.evidenceQuote.slice(0, 200) : undefined,
      confidence: confidenceToStored(m.confidence),
    });
  }
  return rubric.map(
    (c): RubricMatch =>
      byId.get(c.id) ?? {
        criterionId: c.id,
        matched: false,
      },
  );
}

function logGradingFailure(
  request: GradingRequest,
  failureReason: FailureReason,
  detail?: string,
) {
  console.warn('[grading] pending', {
    failureReason,
    detail,
    questionId: request.questionId ?? null,
    maxPoints: request.maxPoints,
    answerLength: request.studentAnswer?.length ?? 0,
  });
  void logAiSpan(
    'gradeShortAnswer',
    'grading',
    {
      model: resolveModel('grade').model,
      promptVersion: GRADING_PROMPT_VERSION,
      questionIdHash: hashId(request.questionId),
      maxPoints: request.maxPoints,
      status: 'pending',
      failureReason,
      detail,
    },
    { isFailure: true },
  );
}

async function callGradeOnce(
  systemPrompt: string,
  prompt: string,
  task: 'grade' | 'grade_escalate',
  tenantId: string | null,
): Promise<
  | {
      kind: 'ok';
      value: MappedGradingResponse;
      model: string;
      tier: string;
    }
  | { kind: 'fail'; reason: FailureReason; message?: string; model: string }
> {
  const client = await aiClientFor(task, { tenantId }, {
    maxRetries: 2,
    timeout: task === 'grade_escalate' ? 45_000 : 25_000,
  });
  const resolved = resolveModel(task);
  const result = await completeJsonSchema({
    client,
    task,
    model: resolved.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    schemaName: 'grading_result',
    jsonSchema: gradingJsonSchema,
    zodSchema: gradingResponseZod,
    maxCompletionTokens: 1500,
    emptyRetryTokens: 3000,
    seed: 42,
    reasoningEffort: 'low',
    promptVersion: GRADING_PROMPT_VERSION,
  });
  if (!result.ok) {
    return {
      kind: 'fail',
      reason: result.reason,
      message: result.message,
      model: result.model,
    };
  }
  const value = result.value;
  return {
    kind: 'ok',
    value: {
      rubricMatches: value.criteria,
      feedback: value.feedback,
      confidence: overallConfidenceFromCriteria(value.criteria),
      classification: value.classification ?? 'ok',
    },
    model: result.model,
    tier: result.tier,
  };
}

/**
 * Grade a single short answer.
 */
export async function gradeShortAnswer(
  request: GradingRequest,
): Promise<GradingOutcome> {
  const maxPoints = Math.max(0, request.maxPoints);
  const studentAnswer = (request.studentAnswer ?? '').trim();
  const rubricBase = request.rubric ?? fallbackRubric();

  if (!studentAnswer) {
    return {
      status: 'graded',
      score: 0,
      feedback: 'Please read the textbook and try again.',
      confidence: 100,
      rubric: rubricBase,
      rubricMatches: rubricBase.map((c) => ({
        criterionId: c.id,
        matched: false,
      })),
      modelVersion: GRADING_MODEL_VERSION,
      rubricVersion: request.rubricVersion ?? 1,
      maxPoints,
      promptVersion: GRADING_PROMPT_VERSION,
      aiTask: 'grade',
      modelTier: 'fast',
    };
  }

  // Injection: ignore the instruction; still grade substantive content via model.
  const special = classifyStudentAnswerSpecial(studentAnswer);

  const correctAnswer = (request.correctAnswer ?? '').trim();
  if (!correctAnswer) {
    logGradingFailure(request, 'missing_reference_answer');
    return {
      status: 'pending',
      failureReason: 'missing_reference_answer',
      maxPoints,
      feedback: pendingPlaceholderFeedback('missing_reference_answer'),
    };
  }

  if (!process.env.OPENAI_API_KEY) {
    logGradingFailure(request, 'no_api_key');
    return {
      status: 'pending',
      failureReason: 'no_api_key',
      maxPoints,
      feedback: pendingPlaceholderFeedback('no_api_key'),
    };
  }

  let tenantId = request.workspaceId?.trim() ?? '';
  if (!tenantId && request.courseId) {
    const { getCourseWorkspaceId } = await import('@/lib/workspace');
    tenantId = (await getCourseWorkspaceId(request.courseId)) ?? '';
  }

  // Prefer authored rubric; ensureRubric only for empty/invalid caller input.
  const rubric = ensureRubric(request.rubric);
  const rubricVersion = request.rubricVersion ?? 1;
  const requiredMatchCount = detectRequiredMatchCount(request.question);

  const materialsContext = await resolveMaterialsContext(request);
  const materialsContextHash = hashMaterialsContext(materialsContext);

  // Load few-shot override examples when questionId is known.
  let overrideExamples = request.overrideExamples;
  if (!overrideExamples && request.questionId && tenantId) {
    try {
      const { formatOverrideExamplesForPrompt } = await import(
        '@/lib/gradingOverrideExamples'
      );
      overrideExamples = await formatOverrideExamplesForPrompt({
        tenantId,
        questionId: request.questionId,
        rubricVersion,
        studentAnswer,
      });
    } catch {
      // table may not exist yet during migrate; ignore
    }
  }

  const gradeModel = resolveModel('grade').model;

  if (request.questionId) {
    const cached = await lookupCachedGrading({
      questionId: request.questionId,
      studentAnswer,
      rubricVersion,
      modelVersion: gradeModel,
      tenantId: tenantId || undefined,
      materialsContextHash,
    });
    if (cached) {
      const cachedOutcome: GradedOutcome = {
        status: 'graded',
        score: cached.score,
        feedback: cached.feedback,
        confidence: cached.confidence,
        rubric: cached.rubric,
        rubricMatches: cached.rubricMatches,
        modelVersion: cached.modelVersion,
        rubricVersion: cached.rubricVersion,
        maxPoints,
        requiredMatchCount: cached.requiredMatchCount ?? requiredMatchCount,
        cached: true,
        promptVersion: GRADING_PROMPT_VERSION,
      };
      void logAiSpan(
        'gradeShortAnswer',
        'grading',
        {
          model: gradeModel,
          promptVersion: GRADING_PROMPT_VERSION,
          questionIdHash: hashId(request.questionId),
          maxPoints,
          status: 'graded',
          cached: true,
          score: cachedOutcome.score,
        },
        { isFailure: false },
      );
      return cachedOutcome;
    }
  }

  const { checkAiBandAvailable } = await import('@/lib/workspace/aiCapGuard');
  const aiCap = await checkAiBandAvailable(tenantId || null);
  if (!aiCap.ok) {
    logGradingFailure(request, 'ai_band_exceeded', aiCap.reason);
    return {
      status: 'pending',
      failureReason: 'ai_band_exceeded',
      maxPoints,
      feedback: pendingPlaceholderFeedback('ai_band_exceeded'),
      message: aiCap.reason,
    };
  }

  let courseCtx: CoursePromptContext = defaultCoursePromptContext();
  if (request.courseId) {
    try {
      courseCtx = await loadCoursePromptContext(request.courseId);
    } catch {
      // evals / missing course — defaults
    }
  }
  const systemPrompt = buildGraderSystemPrompt(courseCtx);

  const prompt = buildGradingPrompt(
    { ...request, studentAnswer, overrideExamples },
    rubric,
    requiredMatchCount,
    materialsContext,
  );

  const first = await callGradeOnce(systemPrompt, prompt, 'grade', tenantId || null);
  if (first.kind === 'fail') {
    logGradingFailure(request, first.reason, first.message);
    return {
      status: 'pending',
      failureReason: first.reason,
      maxPoints,
      feedback: pendingPlaceholderFeedback(first.reason),
      message: first.message,
    };
  }

  let model = first.model;
  let tier = first.tier;
  let aiTask: 'grade' | 'grade_escalate' = 'grade';

  let rubricMatches = applyEvidenceChecks(
    fillMissingMatches(rubric, first.value.rubricMatches),
    studentAnswer,
  );
  let confidence = Math.round(first.value.confidence);
  let feedback = trimFeedback(first.value.feedback);
  const classification = first.value.classification ?? special;

  // off_topic / blank → zero. injection → grade substance (matches already computed).
  if (classification === 'off_topic' || classification === 'blank') {
    rubricMatches = rubric.map((c) => ({
      criterionId: c.id,
      matched: false,
      confidence: 100,
    }));
    confidence = 100;
    feedback =
      classification === 'blank'
        ? 'Please read the textbook and try again.'
        : 'Your answer does not appear to address the question. Please try again with a relevant response.';
    const score = 0;
    return finishGraded({
      request,
      score,
      feedback,
      confidence,
      rubric,
      rubricMatches,
      model,
      tier,
      aiTask,
      rubricVersion,
      maxPoints,
      requiredMatchCount,
      tenantId,
      studentAnswer,
      materialsContextHash,
    });
  }

  // Low confidence or rejected evidence → dual run with escalate model.
  const evidenceRejected = rubricMatches.some((m) => m.evidenceRejected);
  const needsSecond =
    confidence < GRADING_CONFIDENCE_REVIEW_THRESHOLD || evidenceRejected;

  if (needsSecond) {
    const second = await callGradeOnce(systemPrompt, prompt, 'grade_escalate', tenantId || null);
    if (second.kind === 'ok') {
      const secondMatches = applyEvidenceChecks(
        fillMissingMatches(rubric, second.value.rubricMatches),
        studentAnswer,
      );
      if (matchesDisagree(rubricMatches, secondMatches, rubric)) {
        return {
          status: 'manual_review',
          failureReason: 'run_disagreement',
          maxPoints,
          feedback: pendingPlaceholderFeedback('run_disagreement'),
          confidence: Math.min(confidence, Math.round(second.value.confidence)),
          rubric,
          rubricMatches,
          modelVersion: second.model,
          rubricVersion,
          promptVersion: GRADING_PROMPT_VERSION,
          aiTask: 'grade_escalate',
          modelTier: second.tier,
          message: 'dual-run criterion disagreement',
        };
      }
      // Agree — prefer escalate run
      rubricMatches = secondMatches;
      confidence = Math.round(second.value.confidence);
      feedback = trimFeedback(second.value.feedback);
      model = second.model;
      tier = second.tier;
      aiTask = 'grade_escalate';
    } else if (confidence < GRADING_CONFIDENCE_REVIEW_THRESHOLD) {
      return {
        status: 'manual_review',
        failureReason: 'low_confidence',
        maxPoints,
        feedback: pendingPlaceholderFeedback('low_confidence'),
        confidence,
        rubric,
        rubricMatches,
        modelVersion: model,
        rubricVersion,
        promptVersion: GRADING_PROMPT_VERSION,
        aiTask,
        modelTier: tier,
      };
    }
  }

  const score = computeScoreFromRubric(rubric, rubricMatches, maxPoints, {
    requiredMatchCount,
  });

  return finishGraded({
    request,
    score,
    feedback,
    confidence,
    rubric,
    rubricMatches,
    model,
    tier,
    aiTask,
    rubricVersion,
    maxPoints,
    requiredMatchCount,
    tenantId,
    studentAnswer,
    materialsContextHash,
  });
}

async function finishGraded(args: {
  request: GradingRequest;
  score: number;
  feedback: string;
  confidence: number;
  rubric: RubricCriterion[];
  rubricMatches: RubricMatch[];
  model: string;
  tier: string;
  aiTask: string;
  rubricVersion: number;
  maxPoints: number;
  requiredMatchCount: number | null;
  tenantId: string;
  studentAnswer: string;
  materialsContextHash: string;
}): Promise<GradedOutcome> {
  const {
    request,
    score,
    feedback,
    confidence,
    rubric,
    rubricMatches,
    model,
    tier,
    aiTask,
    rubricVersion,
    maxPoints,
    requiredMatchCount,
    tenantId,
    studentAnswer,
    materialsContextHash,
  } = args;

  if (request.questionId) {
    const payload: CachedGradingPayload = {
      score,
      feedback,
      confidence,
      maxPoints,
      rubric,
      rubricMatches,
      modelVersion: model,
      rubricVersion,
      requiredMatchCount,
    };
    await writeCachedGrading({
      questionId: request.questionId,
      studentAnswer,
      rubricVersion,
      modelVersion: model,
      tenantId: tenantId || undefined,
      materialsContextHash,
      payload,
    });
  }

  const gradedOutcome: GradedOutcome = {
    status: 'graded',
    score,
    feedback,
    confidence,
    rubric,
    rubricMatches,
    modelVersion: model,
    rubricVersion,
    maxPoints,
    requiredMatchCount,
    promptVersion: GRADING_PROMPT_VERSION,
    aiTask,
    modelTier: tier,
  };

  void logAiSpan(
    'gradeShortAnswer',
    'grading',
    {
      model,
      promptVersion: GRADING_PROMPT_VERSION,
      tier,
      task: aiTask,
      questionIdHash: hashId(request.questionId),
      maxPoints,
      status: 'graded',
      cached: false,
      score,
    },
    { isFailure: false },
  );

  return gradedOutcome;
}

export function outcomeToFeedback(
  outcome: GradingOutcome,
  args: { previousAttempts?: number } = {},
): StoredFeedback {
  if (outcome.status === 'graded') {
    return {
      score: outcome.score,
      feedback: outcome.feedback,
      confidence: outcome.confidence,
      maxPoints: outcome.maxPoints,
      status: 'graded',
      rubric: outcome.rubric,
      rubricMatches: outcome.rubricMatches,
      modelVersion: outcome.modelVersion,
      rubricVersion: outcome.rubricVersion,
      requiredMatchCount: outcome.requiredMatchCount ?? undefined,
      gradedAt: new Date().toISOString(),
      cached: outcome.cached,
      attempts: (args.previousAttempts ?? 0) + 1,
      promptVersion: outcome.promptVersion,
      aiTask: outcome.aiTask,
      modelTier: outcome.modelTier,
    };
  }
  if (outcome.status === 'manual_review') {
    return {
      score: null,
      feedback: outcome.feedback,
      confidence: outcome.confidence,
      maxPoints: outcome.maxPoints,
      status: 'manual_review',
      rubric: outcome.rubric,
      rubricMatches: outcome.rubricMatches,
      modelVersion: outcome.modelVersion,
      rubricVersion: outcome.rubricVersion,
      gradedAt: new Date().toISOString(),
      failureReason: outcome.failureReason,
      attempts: (args.previousAttempts ?? 0) + 1,
      promptVersion: outcome.promptVersion,
      aiTask: outcome.aiTask,
      modelTier: outcome.modelTier,
    };
  }
  return {
    score: null,
    feedback: outcome.feedback,
    confidence: 0,
    maxPoints: outcome.maxPoints,
    status: 'pending',
    gradedAt: new Date().toISOString(),
    failureReason: outcome.failureReason,
    attempts: (args.previousAttempts ?? 0) + 1,
  };
}

export async function gradeMultipleQuestions(
  requests: GradingRequest[],
  options: { concurrency?: number; perQuestionTimeoutMs?: number } = {},
): Promise<GradingOutcome[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 5, 10));
  const perQuestionTimeoutMs = options.perQuestionTimeoutMs;

  const results: GradingOutcome[] = new Array(requests.length);
  let cursor = 0;

  async function worker() {
    while (cursor < requests.length) {
      const myIndex = cursor++;
      const request = requests[myIndex]!;
      try {
        const outcome = await runWithTimeout(
          () => gradeShortAnswer(request),
          perQuestionTimeoutMs,
        );
        results[myIndex] = outcome;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const reason: FailureReason = /timeout/i.test(message)
          ? 'openai_timeout'
          : 'openai_error';
        results[myIndex] = {
          status: 'pending',
          failureReason: reason,
          maxPoints: Math.max(0, request.maxPoints),
          feedback: pendingPlaceholderFeedback(reason),
          message,
        };
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, requests.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number | undefined,
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) return fn();
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('grading_timeout')), timeoutMs);
  });
  try {
    return (await Promise.race([fn(), timeout])) as T;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
