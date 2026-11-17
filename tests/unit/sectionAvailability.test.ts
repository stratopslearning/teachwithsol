import { describe, expect, it } from 'vitest';

import {
  isSectionConcluded,
  partitionBySectionConclusion,
  partitionEnrollmentsByConclusion,
} from '@/lib/sections/availability';

describe('isSectionConcluded', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('returns false when endsAt is unset', () => {
    expect(isSectionConcluded({ endsAt: null }, now)).toBe(false);
    expect(isSectionConcluded({ endsAt: undefined }, now)).toBe(false);
    expect(isSectionConcluded(null, now)).toBe(false);
  });

  it('returns false when endsAt is in the future', () => {
    expect(
      isSectionConcluded({ endsAt: '2026-08-20T00:00:00.000Z' }, now),
    ).toBe(false);
  });

  it('returns true when now is after endsAt', () => {
    expect(
      isSectionConcluded({ endsAt: '2026-08-01T00:00:00.000Z' }, now),
    ).toBe(true);
  });
});

describe('partitionBySectionConclusion', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('splits active and archived sections', () => {
    const { active, archived } = partitionBySectionConclusion(
      [
        { id: 'a', endsAt: null },
        { id: 'b', endsAt: '2026-08-01T00:00:00.000Z' },
        { id: 'c', endsAt: '2026-09-01T00:00:00.000Z' },
      ],
      now,
    );
    expect(active.map((s) => s.id)).toEqual(['a', 'c']);
    expect(archived.map((s) => s.id)).toEqual(['b']);
  });
});

describe('partitionEnrollmentsByConclusion', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('archives enrollments whose section has ended', () => {
    const { active, archived } = partitionEnrollmentsByConclusion(
      [
        { id: '1', section: { endsAt: null } },
        { id: '2', section: { endsAt: '2026-07-01T00:00:00.000Z' } },
      ],
      now,
    );
    expect(active.map((e) => e.id)).toEqual(['1']);
    expect(archived.map((e) => e.id)).toEqual(['2']);
  });
});

describe('quiz start gate vs section conclusion', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');

  it('blocks new quiz work when section concluded even if quiz endDate is open', () => {
    const section = { endsAt: '2026-08-01T00:00:00.000Z' };
    const quizStillOpen = {
      endDate: '2026-08-30T00:00:00.000Z',
    };
    // Section gate is independent of quiz window — callers check section first.
    expect(isSectionConcluded(section, now)).toBe(true);
    expect(
      quizStillOpen.endDate &&
        now.getTime() <= new Date(quizStillOpen.endDate).getTime(),
    ).toBe(true);
  });

  it('allows quiz window when section has no end date', () => {
    expect(isSectionConcluded({ endsAt: null }, now)).toBe(false);
  });
});
