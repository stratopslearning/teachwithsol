/**
 * Insights analyst — pre-aggregated anonymous stats + v2 prompt.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { withTenant } from '@/lib/db/tenantContext';
import {
  attempts,
  chatbotSessions,
  courseActivities,
  unitInsights,
} from '@/app/db/schema';
import { getAiClientForTask, resolveModel } from '@/lib/ai/gateway';
import {
  defaultCoursePromptContext,
  loadCoursePromptContext,
} from '@/lib/ai/prompts/courseContext';
import {
  buildInsightsSystemPrompt,
  buildInsightsUserPrompt,
  INSIGHTS_PROMPT_VERSION,
} from '@/lib/ai/prompts/insights';
import { completeJsonSchema } from '@/lib/ai/structured';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { ApiError } from '@/lib/api/errors';
import { minimizeStudentTextForAi } from '@/lib/ai/minimizeEducationPayload';

export { INSIGHTS_PROMPT_VERSION };

const DEFAULT_K_MIN = 5;

const insightsZod = z.object({
  misconceptions: z.array(
    z.object({
      topic: z.string().min(1).max(120),
      summary: z.string().min(1).max(800),
      evidenceCount: z.number().int().min(0).optional(),
    }),
  ),
  suggestions: z.array(
    z.object({
      target: z.string().min(1).max(200),
      revision: z.string().min(1).max(1_000),
      relatedQuestionIds: z.array(z.string()).optional(),
    }),
  ),
});

const insightsJsonSchema = {
  type: 'object' as const,
  properties: {
    misconceptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          summary: { type: 'string' },
          evidenceCount: { type: 'number' },
        },
        required: ['topic', 'summary', 'evidenceCount'],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          revision: { type: 'string' },
          relatedQuestionIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        required: ['target', 'revision', 'relatedQuestionIds'],
        additionalProperties: false,
      },
    },
  },
  required: ['misconceptions', 'suggestions'],
  additionalProperties: false,
};

type CriterionAgg = {
  questionId: string;
  criterionId: string;
  missCount: number;
  partialCount: number;
  total: number;
  missRate: number;
  excerpts: string[];
};

/**
 * Build pre-aggregated, k-anonymized input for the insights LLM.
 * Groups with count < kMin are dropped before the model sees them.
 */
export function buildInsightsAggregates(opts: {
  feedbackRows: Array<{
    questionId: string;
    score?: number | null;
    maxPoints?: number;
    rubricMatches?: Array<{
      criterionId: string;
      matched?: boolean;
      partial?: boolean;
    }>;
  }>;
  answers: Record<string, unknown>;
  struggleTopics: string[];
  kMin?: number;
}): {
  criterionMissRates: CriterionAgg[];
  struggleTopicCounts: Array<{ topic: string; count: number }>;
  cappedExcerpts: Array<{ questionId: string; excerpt: string }>;
} {
  const kMin = opts.kMin ?? DEFAULT_K_MIN;
  const byCriterion = new Map<string, CriterionAgg>();
  const excerpts: Array<{ questionId: string; excerpt: string }> = [];

  for (const fb of opts.feedbackRows) {
    const matches = fb.rubricMatches ?? [];
    for (const m of matches) {
      const key = `${fb.questionId}:${m.criterionId}`;
      let row = byCriterion.get(key);
      if (!row) {
        row = {
          questionId: fb.questionId,
          criterionId: m.criterionId,
          missCount: 0,
          partialCount: 0,
          total: 0,
          missRate: 0,
          excerpts: [],
        };
        byCriterion.set(key, row);
      }
      row.total += 1;
      if (!m.matched && !m.partial) row.missCount += 1;
      else if (m.partial && !m.matched) row.partialCount += 1;
    }

    if (
      typeof fb.score === 'number' &&
      fb.maxPoints &&
      fb.score / fb.maxPoints < 0.6
    ) {
      const ans = opts.answers[fb.questionId];
      if (typeof ans === 'string' && ans.trim()) {
        excerpts.push({
          questionId: fb.questionId,
          excerpt: minimizeStudentTextForAi(ans).slice(0, 200),
        });
      }
    }
  }

  const criterionMissRates = [...byCriterion.values()]
    .map((row) => ({
      ...row,
      missRate: row.total > 0 ? row.missCount / row.total : 0,
    }))
    .filter((row) => row.total >= kMin)
    .sort((a, b) => b.missRate - a.missRate)
    .slice(0, 40);

  const topicCounts = new Map<string, number>();
  for (const t of opts.struggleTopics) {
    topicCounts.set(t, (topicCounts.get(t) ?? 0) + 1);
  }
  const struggleTopicCounts = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, count }))
    .filter((r) => r.count >= kMin)
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  // Cap anonymized excerpts; never attach to a group below kMin.
  const cappedExcerpts = excerpts.slice(0, 20);

  return { criterionMissRates, struggleTopicCounts, cappedExcerpts };
}

export async function analyzeUnitInsights(opts: {
  tenantId: string;
  courseId: string;
  outlineId?: string | null;
  moduleId?: string | null;
  quizIds?: string[];
  kMin?: number;
}): Promise<typeof unitInsights.$inferSelect> {
  if (!process.env.OPENAI_API_KEY) {
    throw ApiError.badRequest('OpenAI is not configured');
  }

  const kMin = opts.kMin ?? DEFAULT_K_MIN;

  let quizFilter = opts.quizIds ?? [];
  if (quizFilter.length === 0) {
    // FORCE RLS: run reads under the tenant (plain db reads returned nothing,
    // so insights were generated from no data).
    const activityQuizzes = await withTenant(opts.tenantId, null, (tx) =>
      tx
        .select({ quizId: courseActivities.quizId })
        .from(courseActivities)
        .where(eq(courseActivities.courseId, opts.courseId)),
    );
    quizFilter = activityQuizzes
      .map((r) => r.quizId)
      .filter((id): id is string => Boolean(id));
  }

  const feedbackRows: Array<{
    questionId: string;
    score?: number | null;
    maxPoints?: number;
    rubricMatches?: Array<{
      criterionId: string;
      matched?: boolean;
      partial?: boolean;
    }>;
  }> = [];
  const answersMerged: Record<string, unknown> = {};

  if (quizFilter.length > 0) {
    const recentAttempts = await withTenant(opts.tenantId, null, (tx) =>
      tx.query.attempts.findMany({
        where: and(
          eq(attempts.tenantId, opts.tenantId),
          sql`${attempts.submittedAt} is not null`,
        ),
        orderBy: [desc(attempts.submittedAt)],
        limit: 120,
        columns: {
          id: true,
          quizId: true,
          answers: true,
          gptFeedback: true,
        },
      }),
    );

    for (const att of recentAttempts) {
      if (!quizFilter.includes(att.quizId)) continue;
      const feedback = (att.gptFeedback ?? {}) as Record<
        string,
        {
          score?: number | null;
          maxPoints?: number;
          rubricMatches?: Array<{
            criterionId: string;
            matched?: boolean;
            partial?: boolean;
          }>;
        }
      >;
      const answers = (att.answers ?? {}) as Record<string, unknown>;
      for (const [qid, fb] of Object.entries(feedback)) {
        if (fb == null) continue;
        feedbackRows.push({
          questionId: qid,
          score: fb.score,
          maxPoints: fb.maxPoints,
          rubricMatches: fb.rubricMatches,
        });
        if (typeof answers[qid] === 'string') {
          answersMerged[qid] = answers[qid];
        }
      }
    }
  }

  const sessions = await withTenant(opts.tenantId, null, (tx) =>
    tx.query.chatbotSessions.findMany({
      where: eq(chatbotSessions.tenantId, opts.tenantId),
      orderBy: [desc(chatbotSessions.startedAt)],
      limit: 80,
      columns: { struggleTopics: true },
    }),
  );
  const struggleTopics = sessions.flatMap((s) =>
    Array.isArray(s.struggleTopics) ? (s.struggleTopics as string[]) : [],
  );

  const aggregates = buildInsightsAggregates({
    feedbackRows,
    answers: answersMerged,
    struggleTopics,
    kMin,
  });

  const ctx = await loadCoursePromptContext(opts.courseId).catch(() =>
    defaultCoursePromptContext(),
  );

  const client = getAiClientForTask('insights', { timeout: 90_000 });
  const resolved = resolveModel(
    aggregates.criterionMissRates.length > 20 ? 'review' : 'insights',
  );

  const result = await completeJsonSchema({
    client,
    task: 'insights',
    model: resolved.model,
    messages: [
      {
        role: 'system',
        content: buildInsightsSystemPrompt(ctx, kMin),
      },
      {
        role: 'user',
        content: buildInsightsUserPrompt({
          kMin,
          criterionMissRates: aggregates.criterionMissRates.map((r) => ({
            questionId: r.questionId,
            criterionId: r.criterionId,
            missRate: Number(r.missRate.toFixed(3)),
            partialRate: r.total
              ? Number((r.partialCount / r.total).toFixed(3))
              : 0,
            n: r.total,
          })),
          struggleTopicCounts: aggregates.struggleTopicCounts,
          cappedExcerpts: aggregates.cappedExcerpts,
        }),
      },
    ],
    schemaName: 'unit_insights',
    jsonSchema: insightsJsonSchema,
    zodSchema: insightsZod,
    maxCompletionTokens: 3_000,
    temperature: 0.3,
    promptVersion: INSIGHTS_PROMPT_VERSION,
  });

  if (!result.ok) {
    throw ApiError.badRequest(
      `Insights analysis failed: ${result.reason}`,
    );
  }

  const [row] = await withTenant(opts.tenantId, null, (tx) =>
    tx
      .insert(unitInsights)
      .values({
        tenantId: opts.tenantId,
        courseId: opts.courseId,
        outlineId: opts.outlineId ?? null,
        moduleId: opts.moduleId ?? null,
        misconceptions: result.value.misconceptions,
        suggestions: result.value.suggestions,
        modelVersion: resolved.model,
        promptVersion: INSIGHTS_PROMPT_VERSION,
      })
      .returning(),
  );

  void logAiSpan('insights.analyze', 'insights', {
    courseId: hashId(opts.courseId),
    misconceptionCount: result.value.misconceptions.length,
    suggestionCount: result.value.suggestions.length,
    model: resolved.model,
  });

  return row!;
}

export async function listUnitInsights(opts: {
  tenantId: string;
  courseId: string;
  limit?: number;
}) {
  return withTenant(opts.tenantId, null, (tx) =>
    tx.query.unitInsights.findMany({
      where: and(
        eq(unitInsights.tenantId, opts.tenantId),
        eq(unitInsights.courseId, opts.courseId),
      ),
      orderBy: [desc(unitInsights.createdAt)],
      limit: opts.limit ?? 10,
    }),
  );
}
