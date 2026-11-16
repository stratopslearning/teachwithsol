import type { OutlineItemBody } from '@/app/db/schema';
import { DEFAULT_QUIZ_WINDOW_DAYS } from '@/lib/authoring/constants';
import { DEFAULT_PASSING_SCORE } from '@/lib/quizSchemas';

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO date (YYYY-MM-DD) in local time for prompt injection. */
export function todayLocalDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Short scheduling brief for authoring LLM calls. */
export function authoringScheduleContext(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return [
    `Today is ${local} (use this as day 0 for any schedule).`,
    'Quiz startDate/endDate must be on or after today — never invent past dates.',
    'Default pacing: space quizzes about 1 week apart; each quiz window is ~7–14 days (start → due).',
    'timeLimit in minutes (typically 20–45 for undergrad quizzes).',
    'Return startDate/endDate as full ISO-8601 datetimes.',
  ].join(' ');
}

/**
 * Plan open/due dates for the Nth quiz in a course from today.
 * index is 0-based order among quizzes.
 */
export function planQuizWindowFromToday(opts: {
  index: number;
  windowDays?: number;
  gapDays?: number;
  now?: Date;
}): { startDate: string; endDate: string } {
  const now = opts.now ?? new Date();
  const gapDays = opts.gapDays ?? 7;
  const windowDays = opts.windowDays ?? DEFAULT_QUIZ_WINDOW_DAYS;
  const start = new Date(now.getTime() + opts.index * gapDays * DAY_MS);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + windowDays * DAY_MS);
  end.setHours(23, 59, 0, 0);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value?.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * If schedule dates fell in the past (common LLM hallucination), shift the
 * window forward from today while preserving duration when possible.
 */
export function normalizeQuizScheduleToFuture(
  body: OutlineItemBody,
  now = new Date(),
): OutlineItemBody {
  const start = parseDate(body.startDate ?? null);
  const end = parseDate(body.endDate ?? null);
  if (!start && !end) return body;

  const durationMs =
    start && end && end > start
      ? end.getTime() - start.getTime()
      : DEFAULT_QUIZ_WINDOW_DAYS * DAY_MS;

  let nextStart = start;
  let nextEnd = end;

  if (nextStart && nextStart.getTime() < now.getTime() - DAY_MS) {
    nextStart = new Date(now);
    nextStart.setHours(0, 0, 0, 0);
    nextEnd = new Date(nextStart.getTime() + durationMs);
    nextEnd.setHours(23, 59, 0, 0);
  } else if (nextEnd && nextEnd.getTime() <= now.getTime()) {
    nextEnd = new Date(now.getTime() + Math.max(durationMs, DAY_MS));
    nextEnd.setHours(23, 59, 0, 0);
    if (!nextStart || nextStart >= nextEnd) {
      nextStart = new Date(now);
      nextStart.setHours(0, 0, 0, 0);
    }
  } else if (nextStart && nextEnd && nextEnd <= nextStart) {
    nextEnd = new Date(nextStart.getTime() + durationMs);
  }

  return {
    ...body,
    startDate: nextStart ? nextStart.toISOString() : body.startDate,
    endDate: nextEnd ? nextEnd.toISOString() : body.endDate,
  };
}

/**
 * Guarantee quiz schedule + scoring on first build (and repairs).
 * Uses today-based weekly windows; keeps AI timeLimit/attempts/pass/points when present.
 */
export function ensureQuizAssignmentDefaults(
  body: OutlineItemBody,
  quizIndex: number,
  now = new Date(),
): OutlineItemBody {
  const planned = planQuizWindowFromToday({ index: quizIndex, now });
  const withDefaults: OutlineItemBody = {
    ...body,
    maxAttempts: body.maxAttempts ?? 1,
    passingScore: body.passingScore ?? DEFAULT_PASSING_SCORE,
    timeLimit: body.timeLimit ?? 30,
    startDate: planned.startDate,
    endDate: planned.endDate,
    questions: (body.questions ?? []).map((q) => ({
      ...q,
      points: q.points && q.points > 0 ? q.points : 1,
    })),
  };
  return normalizeQuizScheduleToFuture(withDefaults, now);
}

/** Re-anchor every quiz in an outline from today with weekly spacing. */
export function replanOutlineQuizSchedules<
  T extends {
    type: string;
    body: OutlineItemBody;
  },
>(items: T[], now = new Date()): T[] {
  let quizIndex = 0;
  return items.map((item) => {
    if (item.type !== 'QUIZ') return item;
    const body = ensureQuizAssignmentDefaults(item.body, quizIndex, now);
    quizIndex += 1;
    return { ...item, body };
  });
}
