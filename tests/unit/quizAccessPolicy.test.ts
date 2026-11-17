import { describe, expect, it } from 'vitest';

import {
  evaluateQuizAccess,
  MaxAttemptsExceededError,
  QuizAccessError,
  type QuizAccessContext,
} from '@/lib/quiz/accessPolicy';
import { SECTION_CONCLUDED_MESSAGE } from '@/lib/sectionAvailability';

const now = new Date('2026-03-10T12:00:00.000Z');
const ctx = (over: Partial<QuizAccessContext> = {}): QuizAccessContext => ({
  quiz: { isActive: true, startDate: '2026-03-01T00:00:00Z', endDate: '2026-03-20T00:00:00Z', timeLimit: null, maxAttempts: 2 },
  assignment: { dueDate: null },
  section: { endsAt: null },
  inProgressAttempt: null,
  submittedCount: 0,
  now,
  ...over,
});
const fail = (c: QuizAccessContext, action: 'start' | 'submit') => {
  const r = evaluateQuizAccess(c, action);
  if (r.ok) throw new Error('expected denial');
  return r;
};

describe('evaluateQuizAccess', () => {
  it('allows an open quiz', () => {
    expect(evaluateQuizAccess(ctx(), 'start').ok).toBe(true);
    expect(evaluateQuizAccess(ctx(), 'submit').ok).toBe(true);
  });

  it('keeps the exact messages and response flags the UI shows', () => {
    const archived = fail(ctx({ quiz: { ...ctx().quiz, isActive: false } }), 'start');
    expect(archived.error.message).toBe('This quiz is no longer available.');
    expect(archived.error.extras).toEqual({ quizArchived: true });

    const ended = { quiz: { ...ctx().quiz, endDate: '2026-03-05T00:00:00Z' } };
    expect(fail(ctx(ended), 'start').error.message).toBe('This quiz has ended.');
    expect(fail(ctx(ended), 'submit').error.message).toBe(
      'This quiz has ended. Submissions are no longer accepted.',
    );
    expect(fail(ctx(ended), 'submit').error.extras).toEqual({ quizEnded: true });

    const notOpen = fail(ctx({ quiz: { ...ctx().quiz, startDate: '2026-04-01T00:00:00Z' } }), 'start');
    expect(notOpen.reason).toBe('notStarted');
    expect(notOpen.error.message).toBe('This quiz has not started yet.');

    const due = fail(
      ctx({ quiz: { ...ctx().quiz, endDate: null }, assignment: { dueDate: '2026-03-05T00:00:00Z' } }),
      'submit',
    );
    expect(due.error.message).toBe(
      'The due date for this assignment has passed. Submissions are no longer accepted.',
    );
    expect(due.error.status).toBe(400);
  });

  it('section ended: blocks new work but lets an attempt started before the end finish', () => {
    const section = { endsAt: '2026-03-08T00:00:00Z' };
    expect(fail(ctx({ section }), 'start').error.message).toBe(SECTION_CONCLUDED_MESSAGE);
    expect(
      evaluateQuizAccess(ctx({ section, inProgressAttempt: { startedAt: '2026-03-07T23:00:00Z' } }), 'submit').ok,
    ).toBe(true);
    expect(
      fail(ctx({ section, inProgressAttempt: { startedAt: '2026-03-08T01:00:00Z' } }), 'submit').reason,
    ).toBe('sectionConcluded');
  });

  it('attempt limit applies to new submissions only', () => {
    const r = fail(ctx({ submittedCount: 2 }), 'submit');
    expect(r.error).toBeInstanceOf(MaxAttemptsExceededError);
    expect(r.error.message).toBe('Maximum attempts (2) reached for this quiz. You cannot retake this quiz.');
    expect(
      evaluateQuizAccess(ctx({ submittedCount: 2, inProgressAttempt: { startedAt: now } }), 'submit').ok,
    ).toBe(true);
    // start resolves existing attempts itself and checks the limit after.
    expect(evaluateQuizAccess(ctx({ submittedCount: 2 }), 'start').ok).toBe(true);
  });

  it('rejects a submit past the time limit', () => {
    const r = fail(
      ctx({
        quiz: { ...ctx().quiz, timeLimit: 30 },
        inProgressAttempt: { startedAt: new Date(now.getTime() - 45 * 60_000) },
      }),
      'submit',
    );
    expect(r.reason).toBe('timeLimit');
    expect(r.error.message).toMatch(/^Time limit exceeded\. The quiz has a 30 minute time limit/);
    expect(r.error).toBeInstanceOf(QuizAccessError);
  });
});

// The quiz page uses `view`, so it can't show a quiz that start / submit refuse.
describe("evaluateQuizAccess 'view'", () => {
  const view = (c: QuizAccessContext) => evaluateQuizAccess(c, 'view');

  it('blocks archived, not-started and ended quizzes', () => {
    expect(view(ctx({ quiz: { ...ctx().quiz, isActive: false } }))).toMatchObject({ ok: false, reason: 'archived' });
    expect(view(ctx({ now: new Date('2026-02-01T00:00:00Z') }))).toMatchObject({ ok: false, reason: 'notStarted' });
    expect(view(ctx({ now: new Date('2026-03-25T00:00:00Z') }))).toMatchObject({ ok: false, reason: 'ended' });
  });

  it('a passed due date blocks only when no attempt is in progress', () => {
    // The assignment due date applies only when the quiz has no end date.
    const due = {
      quiz: { ...ctx().quiz, endDate: null },
      assignment: { dueDate: '2026-03-05T00:00:00Z' },
    };
    expect(view(ctx(due))).toMatchObject({ ok: false, reason: 'dueDatePassed' });
    expect(view(ctx({ ...due, inProgressAttempt: { startedAt: '2026-03-04T00:00:00Z' } })).ok).toBe(true);
  });

  it('section ended: same rule as start and submit', () => {
    const ended = { section: { endsAt: '2026-03-08T00:00:00Z' } };
    expect(view(ctx(ended))).toMatchObject({ ok: false, reason: 'sectionConcluded' });
    expect(view(ctx({ ...ended, inProgressAttempt: { startedAt: '2026-03-07T00:00:00Z' } })).ok).toBe(true);
    expect(view(ctx({ ...ended, inProgressAttempt: { startedAt: '2026-03-09T00:00:00Z' } }))).toMatchObject({ ok: false, reason: 'sectionConcluded' });
  });

  it('does not apply the attempt limit', () => {
    expect(view(ctx({ submittedCount: 5 })).ok).toBe(true);
  });
});
