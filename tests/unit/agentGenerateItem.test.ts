import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ responses: [] as unknown[], calls: 0 }));
vi.mock('@/lib/ai/gateway', () => ({
  resolveModel: () => ({ model: 'gpt-4.1' }),
  aiClientFor: vi.fn(async () => ({
    chat: {
      completions: {
        create: vi.fn(async () => {
          const body = m.responses[m.calls++] ?? { description: '', questions: [] };
          return { choices: [{ message: { content: JSON.stringify(body) } }] };
        }),
      },
    },
  })),
}));

import { generateItemBody } from '@/lib/authoring/agentV2/generateItem';

const mc = (i: number) => ({
  type: 'MULTIPLE_CHOICE', question: `Question number ${i}?`, options: ['a', 'b', 'c', 'd'],
  correctAnswer: 'a', rubric: null, points: 1, conceptTags: ['t'],
});
const base = { type: 'QUIZ' as const, title: 'Deadlocks', brief: 'deadlocks', materials: 'm', courseId: 'c' };

beforeEach(() => {
  m.responses = [];
  m.calls = 0;
});

describe('generateItemBody (quiz)', () => {
  it('drops malformed questions and tops up to the requested count', async () => {
    m.responses = [
      {
        description: 'd',
        questions: [
          mc(1), mc(2), mc(3),
          // empty short-answer key (seen in prod) and an MC whose answer isn't an option
          { type: 'SHORT_ANSWER', question: 'Explain it?', options: null, correctAnswer: '', rubric: [], points: 2, conceptTags: ['t'] },
          { ...mc(5), correctAnswer: 'z' },
        ],
      },
      { description: '', questions: [mc(6), mc(7)] },
    ];
    const out = await generateItemBody({ ...base, questionCount: 5 });
    expect(out.body.questions).toHaveLength(5);
    expect(out.body.questions!.map((q) => q.question)).toEqual([
      'Question number 1?', 'Question number 2?', 'Question number 3?', 'Question number 6?', 'Question number 7?',
    ]);
  });

  it('writes big quizzes in parallel batches', async () => {
    m.responses = [0, 1, 2].map((b) => ({
      description: 'd',
      questions: Array.from({ length: b < 2 ? 8 : 4 }, (_, i) => mc(b * 10 + i)),
    }));
    const out = await generateItemBody({ ...base, questionCount: 20 });
    expect(m.calls).toBe(3);
    expect(out.body.questions).toHaveLength(20);
  });

  it('fails with a clear message when nothing usable comes back', async () => {
    await expect(generateItemBody({ ...base, questionCount: 3 })).rejects.toThrow(/no usable questions/);
  });
});
