/**
 * Authoring reviewer — flags draft issues before the instructor sees them (v2).
 */
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import {
  outlineItems,
  type AuthoringReviewFlag,
  type OutlineItemBody,
} from '@/app/db/schema';
import { aiClientFor, resolveModel } from '@/lib/ai/gateway';
import {
  buildReviewSystemPrompt,
  buildReviewUserPrompt,
  REVIEW_PROMPT_VERSION,
} from '@/lib/ai/prompts/review';
import {
  defaultCoursePromptContext,
  loadCoursePromptContext,
} from '@/lib/ai/prompts/courseContext';
import { completeJsonSchema } from '@/lib/ai/structured';
import { hashId, logAiSpan } from '@/lib/ai/tracing';
import { AUTHORING_PROMPT_VERSION } from '@/lib/authoring/constants';
import type { OutlineDetail } from '@/lib/authoring/outlines';
import { withOutlineTenant } from '@/lib/authoring/tenant';

const FLAG_CODES = [
  'multiple_correct',
  'unsupported_fact',
  'objective_misaligned',
  'ambiguity',
  'accessibility',
  'bias',
  'answer_leak',
  'rubric_mismatch',
  'ambiguous_wording',
  'answer_in_stem',
  'missing_source',
  'difficulty_imbalance',
] as const;

const reviewZod = z.object({
  items: z.array(
    z.object({
      itemId: z.string().uuid(),
      flags: z.array(
        z.object({
          code: z.enum(FLAG_CODES),
          message: z.string().min(1).max(500),
          questionIndex: z.number().int().min(0).optional(),
          severity: z.enum(['blocker', 'major', 'minor']).optional(),
        }),
      ),
    }),
  ),
});

const reviewJsonSchema = {
  type: 'object' as const,
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          itemId: { type: 'string' },
          flags: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                code: { type: 'string', enum: [...FLAG_CODES] },
                message: { type: 'string' },
                questionIndex: { type: 'number' },
                severity: {
                  type: 'string',
                  enum: ['blocker', 'major', 'minor'],
                },
              },
              required: ['code', 'message'],
              additionalProperties: false,
            },
          },
        },
        required: ['itemId', 'flags'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

/** Heuristic flags without an LLM (used when API key missing or as supplement). */
export function heuristicReviewFlags(
  body: OutlineItemBody,
  sourceMaterialIds: string[],
): AuthoringReviewFlag[] {
  const flags: AuthoringReviewFlag[] = [];
  const questions = body.questions ?? [];
  if (questions.length === 0 && !body.systemPrompt && !body.interactiveBody) {
    return flags;
  }

  const hasSources =
    sourceMaterialIds.length > 0 ||
    (body.sourceCitations?.length ?? 0) > 0 ||
    questions.some((q) => (q.sourceCitations?.length ?? 0) > 0);
  if (!hasSources) {
    flags.push({
      code: 'missing_source',
      message: 'No source citations or material ids on this item.',
      severity: 'major',
    });
  }

  if (body.unsupportedFacts && body.unsupportedFacts.length > 0) {
    flags.push({
      code: 'unsupported_fact',
      message: `Builder listed unsupported facts: ${body.unsupportedFacts.slice(0, 3).join('; ')}`,
      severity: 'blocker',
    });
  }

  questions.forEach((q, questionIndex) => {
    const stem = q.question?.toLowerCase() ?? '';
    const key = (q.correctAnswer ?? '').toLowerCase().trim();
    if (key && key.length > 3 && stem.includes(key)) {
      flags.push({
        code: 'answer_leak',
        message: 'Correct answer appears verbatim in the question stem.',
        questionIndex,
        severity: 'blocker',
      });
    }
    if (
      q.type === 'SHORT_ANSWER' &&
      (!q.rubric || q.rubric.length < 2) &&
      !(q.correctAnswer ?? '').trim()
    ) {
      flags.push({
        code: 'rubric_mismatch',
        message: 'Short-answer item is missing rubric and reference answer.',
        questionIndex,
        severity: 'major',
      });
    }
    if (
      q.type === 'MULTIPLE_CHOICE' &&
      Array.isArray(q.options) &&
      q.options.length >= 2
    ) {
      const correct = (q.correctAnswer ?? '').trim();
      const matches = q.options.filter(
        (o) => o.trim().toLowerCase() === correct.toLowerCase(),
      );
      if (correct && matches.length !== 1) {
        flags.push({
          code: 'multiple_correct',
          message: 'MCQ correctAnswer does not uniquely match one option.',
          questionIndex,
          severity: 'blocker',
        });
      }
    }
  });

  return flags;
}

/**
 * Run reviewer on outline draft items and persist flags.
 */
export async function reviewOutlineDraft(
  detail: OutlineDetail,
): Promise<OutlineDetail> {
  const flat = detail.modules.flatMap((m) =>
    m.items.map((item) => ({
      itemId: item.id,
      type: item.type,
      title: item.title,
      body: item.body,
      sourceMaterialIds: item.sourceMaterialIds ?? [],
    })),
  );

  if (flat.length === 0) return detail;

  const byId = new Map<string, AuthoringReviewFlag[]>();
  for (const item of flat) {
    byId.set(
      item.itemId,
      heuristicReviewFlags(item.body ?? {}, item.sourceMaterialIds),
    );
  }

  const ctx = detail.courseId
    ? await loadCoursePromptContext(detail.courseId).catch(() =>
        defaultCoursePromptContext({ courseTitle: detail.title }),
      )
    : defaultCoursePromptContext({ courseTitle: detail.title });

  if (process.env.OPENAI_API_KEY) {
    try {
      const client = await aiClientFor('review', { courseId: detail.courseId }, { timeout: 90_000 });
      const model = resolveModel('review').model;
      const payload = flat.map((item) => ({
        itemId: item.itemId,
        type: item.type,
        title: item.title,
        body: item.body,
        sourceMaterialIds: item.sourceMaterialIds,
      }));
      const result = await completeJsonSchema({
        client,
        task: 'review',
        model,
        messages: [
          {
            role: 'system',
            content: buildReviewSystemPrompt(ctx),
          },
          {
            role: 'user',
            content: buildReviewUserPrompt({
              materials: '(see item source citations)',
              itemJson: JSON.stringify(payload).slice(0, 100_000),
            }),
          },
        ],
        schemaName: 'authoring_review',
        jsonSchema: reviewJsonSchema,
        zodSchema: reviewZod,
        maxCompletionTokens: 4_000,
        temperature: 0.2,
        promptVersion: REVIEW_PROMPT_VERSION,
      });
      if (result.ok) {
        for (const row of result.value.items) {
          const prior = byId.get(row.itemId) ?? [];
          const merged = [...prior];
          for (const f of row.flags) {
            if (!merged.some((p) => p.code === f.code && p.message === f.message)) {
              merged.push(f);
            }
          }
          byId.set(row.itemId, merged);
        }
      }
    } catch (err) {
      console.warn('[authoring/review] LLM review skipped', err);
    }
  }

  const resolved = resolveModel('review');
  const flagCount = [...byId.values()].reduce((n, f) => n + f.length, 0);
  void logAiSpan('authoring.review', 'authoring', {
    outlineId: hashId(detail.id),
    itemCount: flat.length,
    flagCount,
    model: resolved.model,
  });
  await withOutlineTenant(detail.id, null, async (tx) => {
    for (const [itemId, flags] of byId) {
      await tx
        .update(outlineItems)
        .set({
          reviewFlags: flags,
          reviewStatus: flags.length > 0 ? 'flagged' : 'cleared',
          aiMeta: {
            promptVersion: AUTHORING_PROMPT_VERSION,
            reviewPromptVersion: REVIEW_PROMPT_VERSION,
            model: resolved.model,
            tier: resolved.tier,
            task: 'review',
          },
          updatedAt: new Date(),
        })
        .where(eq(outlineItems.id, itemId));
    }
  });

  return {
    ...detail,
    modules: detail.modules.map((mod) => ({
      ...mod,
      items: mod.items.map((item) => ({
        ...item,
        reviewFlags: byId.get(item.id) ?? [],
        reviewStatus: (byId.get(item.id)?.length ?? 0) > 0 ? 'flagged' : 'cleared',
      })),
    })),
  } as OutlineDetail;
}
