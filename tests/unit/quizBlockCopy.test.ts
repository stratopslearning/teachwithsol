import { describe, expect, it } from 'vitest';

import { SECTION_CONCLUDED_MESSAGE } from '@/lib/sectionAvailability';
import {
  getQuizBlockCopy,
  isInformationalQuizBlock,
  parseQuizBlockCode,
  startApiErrorToBlockCode,
} from '@/lib/quizBlockCopy';

describe('quizBlockCopy', () => {
  it('maps start-API extras to block codes', () => {
    expect(startApiErrorToBlockCode({ quizNotStarted: true })).toBe(
      'quiz_not_started',
    );
    expect(startApiErrorToBlockCode({ quizArchived: true })).toBe(
      'quiz_unavailable',
    );
    expect(startApiErrorToBlockCode({})).toBeNull();
  });

  it('includes the open time when the quiz has not started', () => {
    const copy = getQuizBlockCopy('quiz_not_started', {
      opensAtLabel: 'Aug 25, 2026, 5:15 PM',
    });
    expect(copy.title).toBe('This quiz has not opened yet');
    expect(copy.description).toContain('Aug 25, 2026, 5:15 PM');
    expect(isInformationalQuizBlock('quiz_not_started')).toBe(true);
  });

  it('uses the section-concluded message and treats other codes as errors', () => {
    expect(getQuizBlockCopy('section_concluded').description).toBe(
      SECTION_CONCLUDED_MESSAGE,
    );
    expect(isInformationalQuizBlock('quiz_ended')).toBe(false);
    expect(parseQuizBlockCode('quiz_not_started')).toBe('quiz_not_started');
    expect(parseQuizBlockCode('nope')).toBeNull();
  });
});
