import { beforeEach, describe, expect, it, vi } from 'vitest';

import { missingExamResource } from '@/lib/quiz/examContext';

describe('missingExamResource', () => {
  it('reports assignment missing first when both rows are absent', () => {
    expect(missingExamResource(undefined, undefined)).toBe('assignment');
    expect(missingExamResource(null, null)).toBe('assignment');
    expect(missingExamResource(undefined, { id: 'quiz' })).toBe('assignment');
  });

  it('reports quiz missing only after assignment is present', () => {
    expect(missingExamResource({ id: 'asg' }, undefined)).toBe('quiz');
    expect(missingExamResource({ id: 'asg' }, null)).toBe('quiz');
  });

  it('returns null when both rows exist', () => {
    expect(missingExamResource({ id: 'asg' }, { id: 'quiz' })).toBeNull();
  });
});

const definerMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db/studentWriteDefiners', () => ({
  loadExamContextDefiner: definerMock,
}));

describe('loadExamContext (SECURITY DEFINER)', () => {
  const full = {
    assignment: { id: 'asg' },
    quiz: { id: 'quiz' },
    inProgressAttempt: { id: 'att' },
    submittedCount: 2,
    quizSectionLinks: [{ sectionId: 'sec' }],
  };

  beforeEach(() => {
    definerMock.mockReset();
  });

  it('passes ids through to the definer and returns its rows', async () => {
    definerMock.mockResolvedValue(full);

    const { loadExamContext } = await import('@/lib/quiz/examContext');
    const ctx = await loadExamContext({
      quizId: 'quiz-1',
      assignmentId: 'asg-1',
      studentId: 'stu-1',
    });

    expect(definerMock).toHaveBeenCalledExactlyOnceWith({
      quizId: 'quiz-1',
      assignmentId: 'asg-1',
      studentId: 'stu-1',
    });
    expect(ctx).toEqual(full);
  });

  it('surfaces missing assignment / quiz as undefined', async () => {
    definerMock.mockResolvedValue({
      assignment: undefined,
      quiz: undefined,
      inProgressAttempt: undefined,
      submittedCount: 0,
      quizSectionLinks: [],
    });

    const { loadExamContext } = await import('@/lib/quiz/examContext');
    const ctx = await loadExamContext({
      quizId: 'quiz-1',
      assignmentId: 'asg-1',
      studentId: 'stu-1',
    });

    expect(missingExamResource(ctx.assignment, ctx.quiz)).toBe('assignment');
    expect(ctx.inProgressAttempt).toBeUndefined();
  });

  it('honors includeSections / includeSubmittedAttempts = false', async () => {
    definerMock.mockResolvedValue(full);

    const { loadExamContext } = await import('@/lib/quiz/examContext');
    const ctx = await loadExamContext({
      quizId: 'quiz-1',
      assignmentId: 'asg-1',
      studentId: 'stu-1',
      includeSections: false,
      includeSubmittedAttempts: false,
    });

    expect(ctx.submittedCount).toBe(0);
    expect(ctx.quizSectionLinks).toEqual([]);
    expect(ctx.inProgressAttempt).toEqual({ id: 'att' });
  });
});
