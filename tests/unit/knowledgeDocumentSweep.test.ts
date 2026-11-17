import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  list: vi.fn(),
  reset: vi.fn(async () => undefined),
  claim: vi.fn(async (_id: string) => null),
  enqueue: vi.fn(async () => undefined),
}));
vi.mock('@/lib/jobs/enqueue', () => ({ enqueueKnowledgeDocumentProcess: m.enqueue }));
vi.mock('@/lib/db/knowledgeJobDefiners', () => ({
  listPendingKnowledgeDocumentsDefiner: m.list,
  resetKnowledgeDocumentPendingDefiner: m.reset,
  claimKnowledgeDocumentDefiner: m.claim,
  insertKnowledgeChunksDefiner: vi.fn(),
  setCourseMaterialStatusDefiner: vi.fn(),
  setKnowledgeDocumentStatusDefiner: vi.fn(),
  supersedeKnowledgeChunksDefiner: vi.fn(),
  updateKnowledgeVersionMetaDefiner: vi.fn(),
}));

import { processPendingKnowledgeDocuments } from '@/lib/knowledge/processDocument';

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockClear();
});

describe('processPendingKnowledgeDocuments', () => {
  it('queues every listed document, flagging stale PROCESSING ones for reset', async () => {
    m.list.mockResolvedValueOnce([
      { id: 'pending-1', status: 'PENDING' },
      { id: 'stuck-1', status: 'PROCESSING' },
    ]);
    expect(await processPendingKnowledgeDocuments(10)).toBe(2);
    expect(m.enqueue.mock.calls).toEqual([
      ['pending-1', 'default', { reset: false }],
      ['stuck-1', 'default', { reset: true }],
    ]);
    // The sweep itself no longer processes inline; the job does.
    expect(m.claim).not.toHaveBeenCalled();
    expect(m.reset).not.toHaveBeenCalled();
    const staleBefore = (m.list.mock.calls[0] as unknown[])[1];
    expect(Date.now() - (staleBefore as Date).getTime()).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
  });
});
