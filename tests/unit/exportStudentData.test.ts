import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenantIds = vi.hoisted(() => vi.fn());
const rowsByTenant = vi.hoisted(() => new Map<string, any>());
const withTenant = vi.hoisted(() =>
  vi.fn(async (tenantId: string, _userId: string | null, fn: (tx: any) => any) => {
    const rows = rowsByTenant.get(tenantId);
    const tx = {
      query: {
        studentSections: { findMany: async () => rows.enrollments },
        attempts: { findMany: async () => rows.attempts },
        chatbotSessions: { findMany: async () => rows.sessions },
      },
    };
    return fn(tx);
  }),
);

vi.mock('@/lib/db/studentWriteDefiners', () => ({
  fetchStudentTenantIdsDefiner: tenantIds,
}));
vi.mock('@/lib/db/tenantContext', () => ({ withTenant }));
vi.mock('@/lib/crypto/fieldEncryption', () => ({
  maybeDecryptAttemptAnswers: (a: unknown) => a,
}));

import { exportStudentData } from '@/lib/student/exportData';

const attempt = (id: string, submittedAt: Date | null) => ({
  id, quizId: 'q', sectionId: 's', score: 1, maxScore: 1, percentage: 100,
  passed: true, gradingStatus: 'complete', startedAt: new Date(0), submittedAt,
  answers: {},
});

beforeEach(() => {
  rowsByTenant.clear();
  withTenant.mockClear();
});

// FORCE RLS: data must be read under each of the student's tenants, not with
// a plain db read (which returned an empty export).
describe('exportStudentData', () => {
  it('reads each tenant under withTenant and merges the results', async () => {
    tenantIds.mockResolvedValue(['t1', 't2']);
    rowsByTenant.set('t1', {
      enrollments: [{ sectionId: 's1', section: { name: 'A', courseId: 'c1' }, enrolledAt: new Date(0) }],
      attempts: [attempt('old', new Date('2026-01-01'))],
      sessions: [],
    });
    rowsByTenant.set('t2', {
      enrollments: [],
      attempts: [attempt('new', new Date('2026-06-01')), attempt('open', null)],
      sessions: [{ id: 'cs', chatbotId: 'b', sectionId: 's2', status: 'ACTIVE', startedAt: new Date(0), completedAt: null, messages: [1, 2], sessionMetadata: null }],
    });

    const out = await exportStudentData('stu');

    expect(withTenant.mock.calls.map((c) => [c[0], c[1]])).toEqual([['t1', 'stu'], ['t2', 'stu']]);
    expect(out.enrollments).toEqual([{ sectionId: 's1', sectionName: 'A', courseId: 'c1', enrolledAt: new Date(0) }]);
    // In-progress first (as Postgres DESC orders NULLs), then newest.
    expect(out.attempts.map((a) => a.id)).toEqual(['open', 'new', 'old']);
    expect(out.chatbotSessions).toEqual([expect.objectContaining({ id: 'cs', messageCount: 2 })]);
  });

  it('returns an empty export when the student has no tenants', async () => {
    tenantIds.mockResolvedValue([]);
    const out = await exportStudentData('stu');
    expect(withTenant).not.toHaveBeenCalled();
    expect(out.attempts).toEqual([]);
  });
});
