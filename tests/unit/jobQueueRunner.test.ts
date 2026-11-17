import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  finish: vi.fn(async (_id: string, _err: string | null, _retry: number) => 'done' as string | null),
  withTenant: vi.fn(async (_t: string, _u: null, fn: () => Promise<unknown>) => fn()),
  grade: vi.fn(async (_id: string) => undefined),
}));
vi.mock('@/lib/db/jobQueue', () => ({
  enqueueJob: vi.fn(),
  claimJobs: vi.fn(async () => []),
  finishJob: m.finish,
}));
vi.mock('@/lib/db/tenantContext', () => ({ withTenant: m.withTenant }));
vi.mock('@/lib/db/assertRuntimeRole', () => ({ requireSafeRuntimeRole: vi.fn(async () => true) }));
vi.mock('@/lib/grading/pendingGrader', () => ({ gradePendingForAttemptId: m.grade }));

import { retryDelaySeconds, runJob, type JobRow } from '@/lib/jobs/queue';

const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: 'job-1',
  kind: 'grade_attempt',
  tenantId: 'tenant-1',
  payload: { attemptId: 'att-1' },
  dedupeKey: 'att-1',
  status: 'running',
  attempts: 1,
  maxAttempts: 4,
  runAfter: new Date(),
  lockedUntil: new Date(),
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockClear();
});

describe('runJob', () => {
  it('runs the handler under the job tenant and records success', async () => {
    expect(await runJob(job())).toBe('done');
    expect(m.withTenant).toHaveBeenCalledWith('tenant-1', null, expect.any(Function));
    expect(m.grade).toHaveBeenCalledWith('att-1');
    expect(m.finish).toHaveBeenCalledWith('job-1', null, 30);
  });

  it('records a thrown error with backoff for a retry', async () => {
    m.grade.mockRejectedValueOnce(new Error('model timeout'));
    m.finish.mockResolvedValueOnce('queued');
    expect(await runJob(job({ attempts: 2 }))).toBe('retried');
    expect(m.finish).toHaveBeenCalledWith('job-1', 'Error: model timeout', 120);
  });

  it('reports dead when the queue gives up', async () => {
    m.grade.mockRejectedValueOnce(new Error('still failing'));
    m.finish.mockResolvedValueOnce('dead');
    expect(await runJob(job({ attempts: 4 }))).toBe('dead');
  });

  it('fails jobs with a bad payload or unknown kind instead of running them', async () => {
    m.finish.mockResolvedValue('queued');
    expect(await runJob(job({ payload: {} }))).toBe('retried');
    expect(m.grade).not.toHaveBeenCalled();
    expect(await runJob(job({ kind: 'nope' }))).toBe('retried');
    m.finish.mockResolvedValue('done');
  });

  it('runs tenantless jobs without a tenant context', async () => {
    await runJob(job({ tenantId: null }));
    expect(m.withTenant).not.toHaveBeenCalled();
    expect(m.grade).toHaveBeenCalledOnce();
  });
});

describe('retryDelaySeconds', () => {
  it('backs off exponentially and caps at an hour', () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelaySeconds)).toEqual([30, 120, 480, 1920, 3600, 3600]);
  });
});
