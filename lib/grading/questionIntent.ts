/**
 * Detect "any N" / "list N" intent from short-answer question text.
 *
 * When detected, rubric criteria are treated as an option pool: the student
 * only needs to satisfy N of them for full credit, not every criterion.
 */

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

const COUNT_TOKEN = '(?:one|two|three|four|five|six|seven|eight|\\d+)';

/** Strip markdown bold/italic markers so "**any two**" matches like "any two". */
function stripMarkdown(text: string): string {
  return text.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1');
}

function parseCountToken(token: string): number | null {
  const lower = token.toLowerCase();
  if (WORD_NUMBERS[lower] != null) return WORD_NUMBERS[lower];
  const n = parseInt(token, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Return the required number of rubric matches when the question asks for
 * "any N", "list N", etc. Returns null when all rubric criteria are required.
 */
export function detectRequiredMatchCount(question: string): number | null {
  const text = stripMarkdown(question).toLowerCase();

  const patterns: RegExp[] = [
    // "any two", "any 2"
    new RegExp(`\\bany\\s+(${COUNT_TOKEN})\\b`, 'i'),
    // "list (any) two", "name (any) two", etc.
    new RegExp(
      `\\b(?:list|name|identify|give|provide|state|describe|mention|cite|discuss)\\s+(?:any\\s+)?(${COUNT_TOKEN})\\b`,
      'i',
    ),
    // "pick/choose/select (any) two"
    new RegExp(
      `\\b(?:pick|choose|select)\\s+(?:any\\s+)?(${COUNT_TOKEN})\\b`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const count = parseCountToken(match[1]);
    if (count != null) return count;
  }

  return null;
}
