import { describe, expect, it } from 'vitest';

describe('professorVisibleAttempts exports', () => {
  it('exports section-scoped helpers', async () => {
    const mod = await import('@/lib/professor/visibleAttempts');
    expect(typeof mod.fetchSubmittedAttemptsForProfessorSections).toBe('function');
    expect(typeof mod.buildGradebookScoresForSection).toBe('function');
  });
});

describe('buildGradebookScoresForSection', () => {
  it('returns empty object when quiz or student lists are empty', async () => {
    const { buildGradebookScoresForSection } = await import(
      '@/lib/professor/visibleAttempts'
    );
    await expect(
      buildGradebookScoresForSection({
        sectionId: 'section-1',
        quizIds: [],
        enrolledStudentIds: ['s1'],
      }),
    ).resolves.toEqual({});
    await expect(
      buildGradebookScoresForSection({
        sectionId: 'section-1',
        quizIds: ['q1'],
        enrolledStudentIds: [],
      }),
    ).resolves.toEqual({});
  });
});
