/**
 * Generate the body of a brand-new quiz or discussion from the course
 * materials (authoring agent create_item).
 *
 * - OpenAI strict JSON-schema output, so every field is always present.
 * - Each question is validated on its own: malformed ones are dropped, not
 *   fatal, and the quiz is topped up until it has the requested count.
 * - Big quizzes are written as parallel batches with different focuses.
 */
import { z } from 'zod';

import type { OutlineItemBody } from '@/app/db/schema';
import { aiClientFor, resolveModel } from '@/lib/ai/gateway';
import { temperatureForModel } from '@/lib/ai/modelRouter';

type Question = NonNullable<OutlineItemBody['questions']>[number];

const tags = z.array(z.string().min(1)).min(1).max(5);
const questionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('MULTIPLE_CHOICE'),
    question: z.string().min(5),
    options: z.array(z.string().min(1)).min(3).max(6),
    correctAnswer: z.string().min(1),
    points: z.number().int().min(1).max(20),
    conceptTags: tags,
  }),
  z.object({
    type: z.literal('TRUE_FALSE'),
    question: z.string().min(5),
    correctAnswer: z.enum(['True', 'False']),
    points: z.number().int().min(1).max(20),
    conceptTags: tags,
  }),
  z.object({
    type: z.literal('SHORT_ANSWER'),
    question: z.string().min(5),
    correctAnswer: z.string().min(1),
    rubric: z
      .array(z.object({ id: z.string().min(1), description: z.string().min(3), weight: z.number().min(0) }))
      .min(1)
      .max(6),
    points: z.number().int().min(1).max(20),
    conceptTags: tags,
  }),
]);

/** Strict schema for OpenAI structured outputs (every key required; nullable where unused). */
const QUIZ_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'questions'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'question', 'options', 'correctAnswer', 'rubric', 'points', 'conceptTags'],
        properties: {
          type: { type: 'string', enum: ['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER'] },
          question: { type: 'string' },
          options: { type: ['array', 'null'], items: { type: 'string' } },
          correctAnswer: {
            type: 'string',
            description: 'MULTIPLE_CHOICE: the exact text of the correct option. TRUE_FALSE: "True" or "False". SHORT_ANSWER: a model answer (never empty).',
          },
          rubric: {
            type: ['array', 'null'],
            description: 'SHORT_ANSWER only: 2–4 criteria with weights summing to 1. null otherwise.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'description', 'weight'],
              properties: { id: { type: 'string' }, description: { type: 'string' }, weight: { type: 'number' } },
            },
          },
          points: { type: 'integer' },
          conceptTags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

const DISCUSSION_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'description', 'instructions', 'systemPrompt'],
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
    instructions: { type: 'string' },
    systemPrompt: { type: 'string' },
  },
} as const;

const discussionSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(1).max(2000),
  instructions: z.string().min(10).max(4000),
  systemPrompt: z.string().min(20).max(6000),
});

/** Angles for parallel quiz batches so they don't overlap. */
const BATCH_FOCUS = [
  'core definitions and key concepts',
  'applying the concepts to concrete scenarios and examples',
  'analysis: comparing approaches, trade-offs, and why things fail',
  'edge cases, misconceptions, and connections to related topics',
  'step-by-step reasoning questions where the material supports them',
];

/** Questions per model call; bigger quizzes are written in parallel batches. */
export const QUIZ_BATCH_SIZE = 8;

export type GenerateItemInput = {
  type: 'QUIZ' | 'DISCUSSION';
  title: string;
  brief: string;
  questionCount?: number;
  difficulty?: 'intro' | 'intermediate' | 'advanced';
  materials: string;
  courseId: string;
};

function quizPrompt(input: GenerateItemInput, n: number, focus?: string, avoid?: string[]): string {
  return `Write ${n} quiz questions for "${input.title}".
Brief from the professor: ${input.brief}
Difficulty: ${input.difficulty ?? 'intermediate'}${focus ? `\nFocus these questions on: ${focus}.` : ''}
Mix MULTIPLE_CHOICE (4 options, exactly one correct; correctAnswer is the exact text of that option), TRUE_FALSE, and SHORT_ANSWER (correctAnswer is a model answer; rubric has 2–4 criteria). Include at least one SHORT_ANSWER unless the brief says otherwise. Points: 1 for MC/TF, 2–5 for short answer.
Base every question on the course materials below; don't test facts that aren't in them. No "all of the above", trick wording, or answers given away by the stem.${avoid?.length ? `\nDon't repeat these existing questions:\n- ${avoid.slice(0, 30).join('\n- ')}` : ''}

Course materials:
${input.materials || '(no matching materials — write from the brief, at an appropriate level)'}`;
}

async function client(courseId: string) {
  const openai = await aiClientFor('build', { courseId }, { timeout: 120_000 });
  const model = resolveModel('build').model;
  return { openai, model, temp: temperatureForModel(model, 0.4) };
}

/** One model call for `n` questions; returns only the questions that validate. */
async function writeQuestions(
  input: GenerateItemInput,
  n: number,
  opts: { focus?: string; avoid?: string[] } = {},
): Promise<{ description: string; questions: Question[]; dropped: number }> {
  const { openai, model, temp } = await client(input.courseId);
  const completion = await openai.chat.completions.create({
    model,
    ...(temp != null ? { temperature: temp } : {}),
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'quiz', strict: true, schema: QUIZ_JSON_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      { role: 'system', content: 'You write rigorous, fair, well-grounded university assessments.' },
      { role: 'user', content: quizPrompt(input, n, opts.focus, opts.avoid) },
    ],
  });
  const raw = JSON.parse(completion.choices[0]?.message?.content ?? '{}') as {
    description?: string;
    questions?: unknown[];
  };
  const questions: Question[] = [];
  let dropped = 0;
  for (const q of raw.questions ?? []) {
    const parsed = questionSchema.safeParse(q);
    if (!parsed.success) {
      dropped += 1;
      continue;
    }
    const v = parsed.data;
    if (v.type === 'MULTIPLE_CHOICE' && !v.options.includes(v.correctAnswer)) {
      dropped += 1;
      continue;
    }
    questions.push(v.type === 'TRUE_FALSE' ? { ...v, options: ['True', 'False'] } : v);
  }
  return { description: raw.description ?? '', questions, dropped };
}

async function generateQuiz(input: GenerateItemInput): Promise<{ title: string; body: OutlineItemBody }> {
  const total = Math.max(1, Math.min(input.questionCount ?? 10, 60));
  const batches = Math.ceil(total / QUIZ_BATCH_SIZE);
  const sizes = Array.from({ length: batches }, (_, i) => Math.min(QUIZ_BATCH_SIZE, total - i * QUIZ_BATCH_SIZE));
  const parts = await Promise.all(
    sizes.map((n, i) =>
      writeQuestions(input, n, { focus: batches > 1 ? BATCH_FOCUS[i % BATCH_FOCUS.length] : undefined }).catch(() => ({
        description: '',
        questions: [] as Question[],
        dropped: n,
      })),
    ),
  );

  const seen = new Set<string>();
  const keep = (q: Question) => {
    const key = q.question.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
  let questions = parts.flatMap((p) => p.questions).filter(keep);

  // Top up once for anything dropped or duplicated.
  if (questions.length < total) {
    const more = await writeQuestions(input, total - questions.length, {
      avoid: questions.map((q) => q.question),
    }).catch(() => null);
    if (more) questions = [...questions, ...more.questions.filter(keep)];
  }
  if (questions.length === 0) {
    throw new Error('The question writer returned no usable questions. Retrying usually works.');
  }
  return {
    title: input.title,
    body: {
      description: parts.find((p) => p.description)?.description || input.brief,
      questions: questions.slice(0, total),
    },
  };
}

async function generateDiscussion(input: GenerateItemInput): Promise<{ title: string; body: OutlineItemBody }> {
  const { openai, model, temp } = await client(input.courseId);
  const completion = await openai.chat.completions.create({
    model,
    ...(temp != null ? { temperature: temp } : {}),
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'discussion', strict: true, schema: DISCUSSION_JSON_SCHEMA as unknown as Record<string, unknown> },
    },
    messages: [
      { role: 'system', content: 'You design thoughtful university discussion assignments.' },
      {
        role: 'user',
        content: `Write a discussion assignment titled "${input.title}".
Brief from the professor: ${input.brief}
description: 1–2 sentences for students. instructions: what students must do and how they're assessed. systemPrompt: instructions for the AI discussion partner, which guides students Socratically without giving answers.
Ground it in the course materials below.

Course materials:
${input.materials || '(no matching materials)'}`,
      },
    ],
  });
  const parsed = discussionSchema.safeParse(JSON.parse(completion.choices[0]?.message?.content ?? '{}'));
  if (!parsed.success) {
    throw new Error('The discussion writer returned an incomplete assignment. Retrying usually works.');
  }
  const d = parsed.data;
  return {
    title: d.title,
    body: { description: d.description, instructions: d.instructions, systemPrompt: d.systemPrompt },
  };
}

export async function generateItemBody(input: GenerateItemInput): Promise<{
  title: string;
  body: OutlineItemBody;
}> {
  return input.type === 'QUIZ' ? generateQuiz(input) : generateDiscussion(input);
}
