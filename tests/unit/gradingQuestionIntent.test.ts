import { describe, expect, it } from 'vitest';

import { detectRequiredMatchCount } from '@/lib/grading/questionIntent';

describe('detectRequiredMatchCount', () => {
  it('detects "any two" with markdown bold', () => {
    expect(
      detectRequiredMatchCount(
        'List **any two** conditions that lead to a preference for lot-size based ordering.',
      ),
    ).toBe(2);
  });

  it('detects "any 2" with digits', () => {
    expect(detectRequiredMatchCount('Name any 2 benefits of JIT.')).toBe(2);
  });

  it('detects "list two" without "any"', () => {
    expect(detectRequiredMatchCount('List two reasons supply chains fail.')).toBe(
      2,
    );
  });

  it('detects "pick any three"', () => {
    expect(
      detectRequiredMatchCount('Pick any three strategies from the reading.'),
    ).toBe(3);
  });

  it('detects "choose two"', () => {
    expect(detectRequiredMatchCount('Choose two correct statements.')).toBe(2);
  });

  it('detects "identify any one"', () => {
    expect(detectRequiredMatchCount('Identify any one key risk.')).toBe(1);
  });

  it('returns null for questions without N-of-M intent', () => {
    expect(
      detectRequiredMatchCount(
        'Explain why quality assurance is process-oriented.',
      ),
    ).toBeNull();
  });

  it('returns null for "list all three" (all required)', () => {
    expect(detectRequiredMatchCount('List all three pillars of lean.')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(detectRequiredMatchCount('')).toBeNull();
  });
});
