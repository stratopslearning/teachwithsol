import { SECTION_CONCLUDED_MESSAGE } from '@/lib/sections/availability';

export type QuizBlockCode =
  | 'quiz_not_started'
  | 'quiz_ended'
  | 'due_date_passed'
  | 'section_concluded'
  | 'not_enrolled'
  | 'quiz_unavailable';

export type QuizBlockCopy = {
  title: string;
  description: string;
};

const TITLES: Record<QuizBlockCode, string> = {
  quiz_not_started: 'This quiz has not opened yet',
  quiz_ended: 'This quiz has ended',
  due_date_passed: 'The due date has passed',
  section_concluded: 'This section has ended',
  not_enrolled: 'This quiz is not assigned to you',
  quiz_unavailable: 'This quiz is not available',
};


export function isInformationalQuizBlock(code: QuizBlockCode): boolean {
  return code === 'quiz_not_started';
}

export function getQuizBlockCopy(
  code: QuizBlockCode,
  extras: {
    opensAtLabel?: string | null;
    closedAtLabel?: string | null;
  } = {},
): QuizBlockCopy {
  const title = TITLES[code];
  switch (code) {
    case 'quiz_not_started':
      return {
        title,
        description: extras.opensAtLabel
          ? `It opens ${extras.opensAtLabel}. You can start it as soon as the window begins.`
          : 'Your instructor set an open time. You can start it as soon as the window begins.',
      };
    case 'quiz_ended':
      return {
        title,
        description: extras.closedAtLabel
          ? `The window closed ${extras.closedAtLabel}. New attempts cannot be started.`
          : 'The time window is closed, so new attempts cannot be started.',
      };
    case 'due_date_passed':
      return {
        title,
        description:
          'This assignment is closed and can no longer be started or retaken.',
      };
    case 'section_concluded':
      return { title, description: SECTION_CONCLUDED_MESSAGE };
    case 'not_enrolled':
      return {
        title,
        description:
          'It is not assigned to any of your active sections. Check Assignments for what you can take.',
      };
    case 'quiz_unavailable':
      return {
        title,
        description:
          'It may have been archived or removed. Check Assignments for what is assigned to you.',
      };
  }
}

export function parseQuizBlockCode(
  value: string | null | undefined,
): QuizBlockCode | null {
  if (
    value === 'quiz_not_started' ||
    value === 'quiz_ended' ||
    value === 'due_date_passed' ||
    value === 'section_concluded' ||
    value === 'not_enrolled' ||
    value === 'quiz_unavailable'
  ) {
    return value;
  }
  return null;
}

export function startApiErrorToBlockCode(error: {
  quizNotStarted?: unknown;
  quizEnded?: unknown;
  dueDatePassed?: unknown;
  sectionConcluded?: unknown;
  quizArchived?: unknown;
}): QuizBlockCode | null {
  if (error.quizNotStarted) return 'quiz_not_started';
  if (error.quizEnded) return 'quiz_ended';
  if (error.dueDatePassed) return 'due_date_passed';
  if (error.sectionConcluded) return 'section_concluded';
  if (error.quizArchived) return 'quiz_unavailable';
  return null;
}
