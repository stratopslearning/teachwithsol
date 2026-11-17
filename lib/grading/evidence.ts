/**
 * Evidence quote verification and match comparison for dual-run grading.
 */

import type { RubricCriterion, RubricMatch } from '@/lib/grading/types';

/** Normalize for case-insensitive substring checks. */
export function normalizeForEvidence(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim();
}

/**
 * True when `quote` appears in `studentAnswer` (normalized). Empty quotes
 * are only allowed when the criterion is unmatched and not partial.
 */
export function evidenceQuoteAppearsInAnswer(
  quote: string | undefined | null,
  studentAnswer: string,
): boolean {
  const q = (quote ?? '').trim();
  if (!q) return false;
  const hay = normalizeForEvidence(studentAnswer);
  const needle = normalizeForEvidence(q);
  if (needle.length < 3) return false;
  return hay.includes(needle);
}

/** Apply evidence checks: fake quotes clear the match. */
export function applyEvidenceChecks(
  matches: RubricMatch[],
  studentAnswer: string,
): RubricMatch[] {
  return matches.map((m) => {
    const quote = m.evidenceQuote ?? m.evidence;
    const needsQuote = m.matched || m.partial;
    if (!needsQuote) {
      return { ...m, evidenceQuote: quote || undefined };
    }
    if (!evidenceQuoteAppearsInAnswer(quote, studentAnswer)) {
      return {
        ...m,
        matched: false,
        partial: undefined,
        evidenceRejected: true,
        evidenceQuote: quote || undefined,
        evidence: quote || undefined,
        confidence: Math.min(m.confidence ?? 50, 40),
      };
    }
    return {
      ...m,
      evidenceQuote: quote || undefined,
      evidence: quote || undefined,
    };
  });
}

export function matchesDisagree(
  a: RubricMatch[],
  b: RubricMatch[],
  rubric: RubricCriterion[],
): boolean {
  for (const c of rubric) {
    const ma = a.find((x) => x.criterionId === c.id);
    const mb = b.find((x) => x.criterionId === c.id);
    const aMatched = !!ma?.matched;
    const bMatched = !!mb?.matched;
    const aPartial = !!ma?.partial;
    const bPartial = !!mb?.partial;
    if (aMatched !== bMatched || aPartial !== bPartial) return true;
  }
  return false;
}

/** Cheap heuristics before calling the model. */
export function classifyStudentAnswerSpecial(
  studentAnswer: string,
): 'ok' | 'injection' | 'off_topic' {
  const text = studentAnswer.trim();
  if (!text) return 'ok';
  const lower = text.toLowerCase();
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|the)\s+(instructions|rubric)/i,
    /give\s+(me\s+)?full\s+marks/i,
    /you\s+are\s+now/i,
    /system\s*prompt/i,
    /disregard\s+(the\s+)?rubric/i,
    /output\s+json\s+with\s+matched\s*:\s*true/i,
  ];
  if (injectionPatterns.some((p) => p.test(text))) return 'injection';

  // Very short non-answer / obvious off-topic single tokens
  if (text.length < 8 && !/[.!?]/.test(text)) {
    const fillers = new Set([
      'idk',
      'n/a',
      'na',
      'none',
      'asdf',
      'test',
      'hello',
      'hi',
    ]);
    if (fillers.has(lower)) return 'off_topic';
  }
  return 'ok';
}
