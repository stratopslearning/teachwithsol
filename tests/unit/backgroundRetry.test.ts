import { beforeEach, describe, expect, it, vi } from 'vitest';

const enqueue = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueGradeAttempt: enqueue }));

import { scheduleAttemptRetry } from '@/lib/quiz/backgroundRetry';

beforeEach(() => enqueue.mockClear());

describe('scheduleAttemptRetry', () => {
  it("enqueues with the attempt's tenant, never 'default'", () => {
    scheduleAttemptRetry('att-1', 'tenant-1');
    expect(enqueue).toHaveBeenCalledWith('att-1', 'tenant-1');
  });

  it('ignores an empty attempt id', () => {
    scheduleAttemptRetry('', 'tenant-1');
    expect(enqueue).not.toHaveBeenCalled();
  });
});
