/**
 * Shared Zod shapes for quiz create/update so professor and admin routes
 * enforce the same field length caps.
 */
import { z } from 'zod';

export const quizQuestionInputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['MULTIPLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER']),
  question: z.string().min(1).max(4_000),
  // DB / edit forms often send null for TRUE_FALSE / SHORT_ANSWER.
  options: z
    .array(z.string().max(2_000))
    .max(12)
    .nullish()
    .transform((v) => v ?? undefined),
  correctAnswer: z
    .string()
    .max(2_000)
    .nullish()
    .transform((v) => v ?? undefined),
  points: z.number().min(1).max(100).default(1),
  order: z.number().min(0).max(500),
});

export const isoDateTimeRequired = z
  .string({ required_error: 'This date is required' })
  .min(1, 'This date is required')
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'Invalid date' });

export function quizWindowSuperRefine(
  data: { startDate: string; endDate: string } & Record<string, unknown>,
  ctx: z.RefinementCtx,
) {
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  if (end <= start) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'End date and time must be after start date and time',
    });
  }
}

/** One default for quizzes created without an explicit passing score (matches the DB column default). */
export const DEFAULT_PASSING_SCORE = 60;

export const quizCreateBaseSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(8_000).optional(),
    sectionIds: z
      .array(z.string().min(1))
      .min(1, 'Select at least one section')
      .max(50),
    maxAttempts: z.number().min(1).max(10).default(1),
    timeLimit: z.number().min(1).max(24 * 60).optional(),
    passingScore: z.number().int().min(0).max(100).default(DEFAULT_PASSING_SCORE),
    startDate: isoDateTimeRequired,
    endDate: isoDateTimeRequired,
    questions: z.array(quizQuestionInputSchema).max(200),
  })
  .superRefine(quizWindowSuperRefine);
