import { describe, expect, it } from 'vitest';

import {
  getEffectiveLimitMinutes,
  getGraceMinutes,
  getRemainingSeconds,
  isNominalTimeLimitReached,
  isTimeLimitExceeded,
} from '@/lib/quiz/timeLimit';

describe('quizTimeLimit', () => {
  const startedAt = new Date('2026-01-01T12:00:00.000Z');

  it('adds 15% grace capped between 2 and 5 minutes', () => {
    expect(getGraceMinutes(30)).toBe(5);
    expect(getGraceMinutes(10)).toBe(2);
    expect(getGraceMinutes(60)).toBe(5);
    expect(getEffectiveLimitMinutes(30)).toBe(35);
  });

  it('counts down remaining seconds to the nominal limit', () => {
    const at25Min = new Date(startedAt.getTime() + 25 * 60 * 1000);
    expect(getRemainingSeconds(30, startedAt, at25Min)).toBe(5 * 60);
    const at30Min = new Date(startedAt.getTime() + 30 * 60 * 1000);
    expect(getRemainingSeconds(30, startedAt, at30Min)).toBe(0);
  });

  it('treats nominal expiry as not exceeded until grace ends', () => {
    const at30Min = new Date(startedAt.getTime() + 30 * 60 * 1000);
    expect(isNominalTimeLimitReached(30, startedAt, at30Min)).toBe(true);
    expect(isTimeLimitExceeded(30, startedAt, at30Min)).toBe(false);

    const at34Min = new Date(startedAt.getTime() + 34 * 60 * 1000);
    expect(isTimeLimitExceeded(30, startedAt, at34Min)).toBe(false);

    const at35Min = new Date(startedAt.getTime() + 35 * 60 * 1000);
    expect(isTimeLimitExceeded(30, startedAt, at35Min)).toBe(false);

    const pastGrace = new Date(startedAt.getTime() + 36 * 60 * 1000);
    expect(isTimeLimitExceeded(30, startedAt, pastGrace)).toBe(true);
  });

  it('returns null remaining when there is no time limit', () => {
    expect(getRemainingSeconds(null, startedAt)).toBeNull();
    expect(isTimeLimitExceeded(null, startedAt)).toBe(false);
  });
});
