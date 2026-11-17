/**
 * Shared Zod shapes for quiz create/update so professor and admin routes
 * enforce the same field length caps.
 */
import { z } from 'zod';
import { QUESTION_TYPES } from '@/app/db/enums';

export const quizQuestionInputSchema = z.object({
  id: z.string().optional(),
  type: z.enum(QUESTION_TYPES),
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

/** Limits the server enforces; quiz forms use the same numbers. */
export const QUIZ_LIMITS = {
  titleMax: 200,
  descriptionMax: 8_000,
  timeLimitMaxMinutes: 24 * 60,
} as const;

/**
 * Fields shared by quiz create and update (professor, admin and MCP routes).
 * `null` from edit forms means "unset" for description and time limit.
 */
const quizFields = z.object({
  title: z.string().min(1).max(QUIZ_LIMITS.titleMax),
  description: z
    .string()
    .max(QUIZ_LIMITS.descriptionMax)
    .nullish()
    .transform((v) => v ?? undefined),
  sectionIds: z
    .array(z.string().min(1))
    .min(1, 'Select at least one section')
    .max(50),
  // 20 covers quizzes admins already saved above the UI's limit of 10.
  maxAttempts: z.number().int().min(1).max(20).default(1),
  timeLimit: z
    .number()
    .int()
    .min(1)
    .max(QUIZ_LIMITS.timeLimitMaxMinutes)
    .nullish()
    .transform((v) => v ?? undefined),
  passingScore: z.number().int().min(0).max(100).default(DEFAULT_PASSING_SCORE),
  /** Students don't see per-question feedback until the quiz closes. */
  hideFeedbackAfterDue: z.boolean().optional(),
  startDate: isoDateTimeRequired,
  endDate: isoDateTimeRequired,
  questions: z.array(quizQuestionInputSchema).max(200),
});

export const quizCreateBaseSchema = quizFields.superRefine(quizWindowSuperRefine);

/** Update = create + whether the quiz is active. */
export const quizUpdateSchema = quizFields
  .extend({ isActive: z.boolean().default(true) })
  .superRefine(quizWindowSuperRefine);
