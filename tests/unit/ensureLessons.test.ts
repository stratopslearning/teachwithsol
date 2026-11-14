import { describe, expect, it } from 'vitest';

import {
  moduleNeedsInteractiveLesson,
  outlineNeedsInteractiveLessons,
} from '@/lib/authoring/ensureLessons';
import { looksLikeEnsureLessonsRequest } from '@/lib/authoring/intent';
import type { OutlineDetail } from '@/lib/authoring/outlines';

describe('ensureLessons helpers', () => {
  it('detects ensure-lessons phrasing', () => {
    expect(
      looksLikeEnsureLessonsRequest('add interactive lessons to each module'),
    ).toBe(true);
    expect(
      looksLikeEnsureLessonsRequest('upgrade to Shah-style chapters'),
    ).toBe(true);
    expect(looksLikeEnsureLessonsRequest('make the quiz harder')).toBe(false);
  });

  it('flags modules that do not start with a built LESSON', () => {
    expect(
      moduleNeedsInteractiveLesson({
        items: [{ type: 'QUIZ', body: {} }],
      }),
    ).toBe(true);
    // Hollow ensure-lessons stub must still need a build.
    expect(
      moduleNeedsInteractiveLesson({
        items: [
          {
            type: 'LESSON',
            body: {
              chapter: {
                kind: 'interactive_chapter',
                learningObjectives: [],
                sections: [
                  {
                    id: 's1',
                    title: 'Introduction',
                    markdown: '',
                    checkBank: [],
                  },
                ],
              },
            },
          },
        ],
      }),
    ).toBe(true);
    expect(
      moduleNeedsInteractiveLesson({
        items: [
          {
            type: 'LESSON',
            body: {
              chapter: {
                kind: 'interactive_chapter',
                learningObjectives: ['Explain SCM'],
                sections: [
                  {
                    id: 's1',
                    title: 'Intro',
                    markdown: 'Supply chains move goods.',
                    checkBank: [
                      {
                        question: 'Q1?',
                        options: ['A', 'B'],
                        correctAnswer: 'A',
                      },
                      {
                        question: 'Q2?',
                        options: ['A', 'B'],
                        correctAnswer: 'A',
                      },
                      {
                        question: 'Q3?',
                        options: ['A', 'B'],
                        correctAnswer: 'A',
                      },
                      {
                        question: 'Q4?',
                        options: ['A', 'B'],
                        correctAnswer: 'A',
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      }),
    ).toBe(false);
  });

  it('outlineNeedsInteractiveLessons on quiz-only courses', () => {
    const detail = {
      modules: [
        {
          id: 'm1',
          title: 'Week 1',
          summary: null,
          position: 0,
          items: [{ type: 'QUIZ', body: {} }],
        },
      ],
    } as OutlineDetail;
    expect(outlineNeedsInteractiveLessons(detail)).toBe(true);
  });
});
