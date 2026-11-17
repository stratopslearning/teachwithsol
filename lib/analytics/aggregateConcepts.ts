import { CONCEPT_GAP_THRESHOLD } from '@/lib/analytics/constants';
import type { QuestionStatRow } from '@/lib/quiz/questionStats';

export type ConceptMasteryRow = {
  tag: string;
  questionCount: number;
  attemptCount: number;
  correctCount: number;
  successRate: number;
  gap: boolean;
  /** True when the group is below the k-anonymity minimum (outcomes redacted). */
  suppressed?: boolean;
};

export type TagCoverage = {
  totalQuestions: number;
  taggedQuestions: number;
  percent: number;
};

/**
 * Pure rollup: explode per-question stats into per-tag mastery.
 * Untagged questions are excluded from concept rows but counted in coverage.
 */
export function aggregateConceptMastery(
  questionStats: QuestionStatRow[],
  gapThreshold = CONCEPT_GAP_THRESHOLD,
): { concepts: ConceptMasteryRow[]; tagCoverage: TagCoverage } {
  const totalQuestions = questionStats.length;
  let taggedQuestions = 0;

  const byTag = new Map<
    string,
    { questionCount: number; attemptCount: number; correctCount: number }
  >();

  for (const q of questionStats) {
    const tags = (q.conceptTags ?? [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length === 0) continue;
    taggedQuestions += 1;

    const unique = [...new Set(tags)];
    for (const tag of unique) {
      const cur = byTag.get(tag) ?? {
        questionCount: 0,
        attemptCount: 0,
        correctCount: 0,
      };
      cur.questionCount += 1;
      cur.attemptCount += q.attempts;
      cur.correctCount += q.correctAnswers;
      byTag.set(tag, cur);
    }
  }

  const concepts: ConceptMasteryRow[] = [...byTag.entries()]
    .map(([tag, cur]) => {
      const successRate =
        cur.attemptCount > 0
          ? Math.round((cur.correctCount / cur.attemptCount) * 100)
          : 0;
      return {
        tag,
        questionCount: cur.questionCount,
        attemptCount: cur.attemptCount,
        correctCount: cur.correctCount,
        successRate,
        gap: cur.attemptCount > 0 && successRate < gapThreshold,
      };
    })
    .sort((a, b) => {
      if (a.gap !== b.gap) return a.gap ? -1 : 1;
      return a.successRate - b.successRate || a.tag.localeCompare(b.tag);
    });

  return {
    concepts,
    tagCoverage: {
      totalQuestions,
      taggedQuestions,
      percent:
        totalQuestions > 0
          ? Math.round((taggedQuestions / totalQuestions) * 100)
          : 0,
    },
  };
}
