import { beforeEach, describe, expect, it, vi } from 'vitest';

const definer = vi.hoisted(() => vi.fn());
vi.mock('@/lib/db/studentWriteDefiners', () => ({
  fetchAttemptWithQuizAssignmentDefiner: definer,
}));
vi.mock('@/lib/db/tenantContext', () => ({ withTenant: vi.fn() }));

import { loadOwnAttempt } from '@/lib/quiz/gradingData';

const bundle = {
  attempt: { id: 'att-1', studentId: 'stu-1', quizId: 'quiz-1', tenantId: 't1' },
  quiz: { id: 'quiz-1', title: 'Quiz' },
  assignment: null,
};

beforeEach(() => definer.mockReset());

// The lookup bypasses RLS, so this check is what keeps students out of each
// other's attempts on the results / review pages.
describe('loadOwnAttempt', () => {
  it("returns the student's own attempt with its quiz", async () => {
    definer.mockResolvedValue(bundle);
    expect(await loadOwnAttempt('att-1', 'stu-1')).toEqual({
      attempt: bundle.attempt,
      quiz: bundle.quiz,
    });
  });

  it("refuses another student's attempt", async () => {
    definer.mockResolvedValue(bundle);
    expect(await loadOwnAttempt('att-1', 'someone-else')).toBeNull();
  });

  it('returns null for a missing attempt or quiz', async () => {
    definer.mockResolvedValue(null);
    expect(await loadOwnAttempt('att-x', 'stu-1')).toBeNull();
    definer.mockResolvedValue({ ...bundle, quiz: undefined });
    expect(await loadOwnAttempt('att-1', 'stu-1')).toBeNull();
  });
});
