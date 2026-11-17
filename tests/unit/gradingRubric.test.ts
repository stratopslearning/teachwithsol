/**
 * Rubric-based deterministic scoring tests.
 *
 * The whole point of `computeScoreFromRubric` is that it's a pure function of
 * (rubric, matches, maxPoints). Given identical inputs, it must always return
 * the same integer in [0, maxPoints].
 */
import { describe, expect, it, vi } from 'vitest';

// db is touched at module-import time by gradingRubric — stub it.
vi.mock('@/app/db', () => ({
  db: { update: () => ({ set: () => ({ where: async () => undefined }) }) },
}));

import {
  computeScoreFromRubric,
  fallbackRubric,
  readRubricFromColumn,
} from '@/lib/grading/rubric';

describe('computeScoreFromRubric', () => {
  const baseRubric = [
    { id: 'c1', description: 'A', weight: 1 },
    { id: 'c2', description: 'B', weight: 1 },
    { id: 'c3', description: 'C', weight: 1 },
  ];

  it('returns 0 for an empty rubric', () => {
    expect(computeScoreFromRubric([], [], 10)).toBe(0);
  });

  it('returns 0 when maxPoints is 0', () => {
    expect(
      computeScoreFromRubric(
        baseRubric,
        baseRubric.map((c) => ({ criterionId: c.id, matched: true })),
        0,
      ),
    ).toBe(0);
  });

  it('returns maxPoints when every criterion is matched', () => {
    expect(
      computeScoreFromRubric(
        baseRubric,
        baseRubric.map((c) => ({ criterionId: c.id, matched: true })),
        10,
      ),
    ).toBe(10);
  });

  it('returns 0 when nothing matches', () => {
    expect(
      computeScoreFromRubric(
        baseRubric,
        baseRubric.map((c) => ({ criterionId: c.id, matched: false })),
        10,
      ),
    ).toBe(0);
  });

  it('treats partial as 0.5 weight', () => {
    const matches = [
      { criterionId: 'c1', matched: true },
      { criterionId: 'c2', matched: false, partial: true },
      { criterionId: 'c3', matched: false },
    ];
    // 1 + 0.5 + 0 = 1.5 of 3 = 50% × 10 = 5
    expect(computeScoreFromRubric(baseRubric, matches, 10)).toBe(5);
  });

  it('ignores partial when matched is also true', () => {
    const matches = [
      { criterionId: 'c1', matched: true, partial: true },
    ];
    const rubric = [{ id: 'c1', description: 'A', weight: 1 }];
    expect(computeScoreFromRubric(rubric, matches, 4)).toBe(4);
  });

  it('respects criterion weights', () => {
    const rubric = [
      { id: 'c1', description: 'A', weight: 2 },
      { id: 'c2', description: 'B', weight: 1 },
    ];
    // Only the heavy-weight criterion matches → 2/3 × 6 = 4
    expect(
      computeScoreFromRubric(
        rubric,
        [
          { criterionId: 'c1', matched: true },
          { criterionId: 'c2', matched: false },
        ],
        6,
      ),
    ).toBe(4);
  });

  it('silently drops out-of-rubric criterionId values (defense-in-depth)', () => {
    const matches = [
      { criterionId: 'c1', matched: true },
      { criterionId: 'cBogus', matched: true },
    ];
    const rubric = [{ id: 'c1', description: 'A', weight: 1 }];
    expect(computeScoreFromRubric(rubric, matches, 4)).toBe(4);
  });

  it('clamps the score within [0, maxPoints] under any input', () => {
    const rubric = [{ id: 'c1', description: 'A', weight: 1 }];
    expect(
      computeScoreFromRubric(
        rubric,
        [{ criterionId: 'c1', matched: true }],
        2,
      ),
    ).toBe(2);
    // Negative weight → treated as 0 (clamped).
    expect(
      computeScoreFromRubric(
        [{ id: 'c1', description: 'A', weight: -1 }],
        [{ criterionId: 'c1', matched: true }],
        2,
      ),
    ).toBe(0);
  });

  it('is deterministic: same inputs → same output, every time', () => {
    const matches = [
      { criterionId: 'c1', matched: true },
      { criterionId: 'c2', matched: false, partial: true },
      { criterionId: 'c3', matched: true },
    ];
    const first = computeScoreFromRubric(baseRubric, matches, 5);
    for (let i = 0; i < 100; i += 1) {
      expect(computeScoreFromRubric(baseRubric, matches, 5)).toBe(first);
    }
  });

  it('handles the maxPoints = 2 + single-criterion case that bit Ella on Quiz 4', () => {
    const rubric = [{ id: 'c1', description: 'A', weight: 1 }];
    // matched → 2/2
    expect(
      computeScoreFromRubric(rubric, [{ criterionId: 'c1', matched: true }], 2),
    ).toBe(2);
    // partial → 1/2 (no more "20% × 2 = 0" rounding bug)
    expect(
      computeScoreFromRubric(
        rubric,
        [{ criterionId: 'c1', matched: false, partial: true }],
        2,
      ),
    ).toBe(1);
    // unmatched → 0/2
    expect(
      computeScoreFromRubric(rubric, [{ criterionId: 'c1', matched: false }], 2),
    ).toBe(0);
  });

  describe('any-N (top-N of M) scoring', () => {
    const lotSizeRubric = [
      { id: 'c1', description: 'Full load preference', weight: 1 },
      { id: 'c2', description: 'Bulk purchase discounts', weight: 1 },
      { id: 'c3', description: 'EOQ model', weight: 1 },
    ];

    it('awards full credit when any 2 of 3 criteria match', () => {
      const matches = [
        { criterionId: 'c1', matched: true },
        { criterionId: 'c2', matched: true },
        { criterionId: 'c3', matched: false },
      ];
      expect(
        computeScoreFromRubric(lotSizeRubric, matches, 2, {
          requiredMatchCount: 2,
        }),
      ).toBe(2);
    });

    it('awards partial credit when only 1 of required 2 matches', () => {
      const matches = [
        { criterionId: 'c1', matched: true },
        { criterionId: 'c2', matched: false },
        { criterionId: 'c3', matched: false },
      ];
      expect(
        computeScoreFromRubric(lotSizeRubric, matches, 2, {
          requiredMatchCount: 2,
        }),
      ).toBe(1);
    });

    it('counts partial toward any-N top slots', () => {
      const matches = [
        { criterionId: 'c1', matched: true },
        { criterionId: 'c2', matched: false, partial: true },
        { criterionId: 'c3', matched: false },
      ];
      // top 2 slots: 1.0 + 0.5 = 1.5 / 2 → round(1.5/2 * 2) = 2
      expect(
        computeScoreFromRubric(lotSizeRubric, matches, 2, {
          requiredMatchCount: 2,
        }),
      ).toBe(2);
    });

    it('falls back to all-required when requiredMatchCount >= rubric length', () => {
      const matches = [
        { criterionId: 'c1', matched: true },
        { criterionId: 'c2', matched: true },
        { criterionId: 'c3', matched: false },
      ];
      expect(
        computeScoreFromRubric(lotSizeRubric, matches, 2, {
          requiredMatchCount: 3,
        }),
      ).toBe(1);
    });
  });
});

describe('readRubricFromColumn', () => {
  it('returns null for null', () => {
    expect(readRubricFromColumn(null)).toBeNull();
  });

  it('returns null for an empty array', () => {
    expect(readRubricFromColumn([])).toBeNull();
  });

  it('returns null for a malformed shape', () => {
    expect(readRubricFromColumn([{ id: 'x' }])).toBeNull();
    expect(readRubricFromColumn([{ id: 'x', description: 'y', weight: 'oops' }])).toBeNull();
  });

  it('returns the rubric when well-formed', () => {
    const rubric = [{ id: 'c1', description: 'A', weight: 1 }];
    expect(readRubricFromColumn(rubric)).toEqual([
      { id: 'c1', description: 'A', weight: 1, points: 1 },
    ]);
  });
});

describe('fallbackRubric', () => {
  it('returns a single weight-1 criterion', () => {
    const rubric = fallbackRubric();
    expect(rubric).toHaveLength(1);
    expect(rubric[0]!.weight).toBe(1);
  });
});
