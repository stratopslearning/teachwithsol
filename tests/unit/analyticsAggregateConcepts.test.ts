import { describe, expect, it } from 'vitest';

import { aggregateConceptMastery } from '@/lib/analytics/aggregateConcepts';
import type { QuestionStatRow } from '@/lib/quiz/questionStats';

function q(
  partial: Partial<QuestionStatRow> & Pick<QuestionStatRow, 'id'>,
): QuestionStatRow {
  return {
    order: 0,
    question: 'Q',
    correctAnswer: 'A',
    type: 'MULTIPLE_CHOICE',
    points: 1,
    conceptTags: [],
    attempts: 0,
    correctAnswers: 0,
    successRate: 0,
    ...partial,
  };
}

describe('aggregateConceptMastery', () => {
  it('excludes untagged questions from concept rows but counts them in coverage', () => {
    const { concepts, tagCoverage } = aggregateConceptMastery([
      q({ id: '1', conceptTags: ['supply'], attempts: 10, correctAnswers: 8 }),
      q({ id: '2', conceptTags: [], attempts: 5, correctAnswers: 5 }),
      q({ id: '3', conceptTags: null, attempts: 2, correctAnswers: 1 }),
    ]);

    expect(tagCoverage).toEqual({
      totalQuestions: 3,
      taggedQuestions: 1,
      percent: 33,
    });
    expect(concepts).toHaveLength(1);
    expect(concepts[0]?.tag).toBe('supply');
    expect(concepts[0]?.attemptCount).toBe(10);
  });

  it('counts a multi-tag question toward each distinct tag', () => {
    const { concepts } = aggregateConceptMastery([
      q({
        id: '1',
        conceptTags: ['Supply', 'demand', 'supply'],
        attempts: 4,
        correctAnswers: 2,
      }),
    ]);

    expect(concepts.map((c) => c.tag).sort()).toEqual(['demand', 'supply']);
    for (const row of concepts) {
      expect(row.questionCount).toBe(1);
      expect(row.attemptCount).toBe(4);
      expect(row.correctCount).toBe(2);
      expect(row.successRate).toBe(50);
    }
  });

  it('flags gaps when successRate is under 60% with attempts', () => {
    const { concepts } = aggregateConceptMastery([
      q({
        id: '1',
        conceptTags: ['hard'],
        attempts: 10,
        correctAnswers: 5,
      }),
      q({
        id: '2',
        conceptTags: ['edge'],
        attempts: 10,
        correctAnswers: 6,
      }),
      q({
        id: '3',
        conceptTags: ['easy'],
        attempts: 10,
        correctAnswers: 9,
      }),
      q({
        id: '4',
        conceptTags: ['untouched'],
        attempts: 0,
        correctAnswers: 0,
      }),
    ]);

    const byTag = Object.fromEntries(concepts.map((c) => [c.tag, c]));
    expect(byTag.hard?.gap).toBe(true);
    expect(byTag.hard?.successRate).toBe(50);
    expect(byTag.edge?.gap).toBe(false);
    expect(byTag.edge?.successRate).toBe(60);
    expect(byTag.easy?.gap).toBe(false);
    expect(byTag.untouched?.gap).toBe(false);
    expect(byTag.untouched?.successRate).toBe(0);
  });

  it('sorts gaps first then by ascending success rate', () => {
    const { concepts } = aggregateConceptMastery([
      q({
        id: 'a',
        conceptTags: ['z-ok'],
        attempts: 10,
        correctAnswers: 9,
      }),
      q({
        id: 'b',
        conceptTags: ['a-gap'],
        attempts: 10,
        correctAnswers: 4,
      }),
      q({
        id: 'c',
        conceptTags: ['m-gap'],
        attempts: 10,
        correctAnswers: 5,
      }),
    ]);

    expect(concepts.map((c) => c.tag)).toEqual(['a-gap', 'm-gap', 'z-ok']);
  });
});
