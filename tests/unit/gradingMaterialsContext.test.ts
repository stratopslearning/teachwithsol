import { describe, expect, it } from 'vitest';

import {
  buildGradingPrompt,
  formatMaterialsGradingSection,
} from '@/lib/grading';
import { hashMaterialsContext } from '@/lib/grading/cache';
import { ensureRubric } from '@/lib/grading/rubric';

describe('formatMaterialsGradingSection', () => {
  it('returns empty for blank input', () => {
    expect(formatMaterialsGradingSection('')).toBe('');
    expect(formatMaterialsGradingSection('   ')).toBe('');
  });

  it('labels materials as terminology-only', () => {
    const section = formatMaterialsGradingSection('Photosynthesis converts light.');
    expect(section).toContain('COURSE MATERIALS');
    expect(section).toContain('terminology only');
    expect(section).toContain('REFERENCE ANSWER remains the only scoring standard');
    expect(section).toContain('Photosynthesis converts light.');
  });
});

describe('buildGradingPrompt with materials', () => {
  it('includes materials block when provided', () => {
    const rubric = ensureRubric(undefined);
    const prompt = buildGradingPrompt(
      {
        question: 'What is X?',
        studentAnswer: 'X is Y',
        correctAnswer: 'Y',
        maxPoints: 1,
        questionType: 'SHORT_ANSWER',
      },
      rubric,
      null,
      'Course notes about X.',
    );
    expect(prompt).toContain('<reference_answer>');
    expect(prompt).toContain('<materials>');
    expect(prompt).toContain('Course notes about X.');
  });

  it('omits materials block when empty', () => {
    const rubric = ensureRubric(undefined);
    const prompt = buildGradingPrompt(
      {
        question: 'What is X?',
        studentAnswer: 'X is Y',
        correctAnswer: 'Y',
        maxPoints: 1,
        questionType: 'SHORT_ANSWER',
      },
      rubric,
      null,
      '',
    );
    expect(prompt).toContain('<materials></materials>');
    expect(prompt).not.toContain('Course notes');
  });
});

describe('hashMaterialsContext', () => {
  it('returns empty for blank', () => {
    expect(hashMaterialsContext('')).toBe('');
    expect(hashMaterialsContext('  ')).toBe('');
  });

  it('is stable and short', () => {
    const a = hashMaterialsContext('same text');
    const b = hashMaterialsContext('same text');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(hashMaterialsContext('other')).not.toBe(a);
  });
});
