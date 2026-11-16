import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  list: vi.fn(),
  reset: vi.fn(async () => undefined),
  claim: vi.fn(async (_id: string) => null),
}));
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
  it('resets stale PROCESSING documents, then retries every listed document', async () => {
    m.list.mockResolvedValueOnce([
      { id: 'pending-1', status: 'PENDING' },
      { id: 'stuck-1', status: 'PROCESSING' },
    ]);
    expect(await processPendingKnowledgeDocuments(10)).toBe(2);
    expect(m.reset).toHaveBeenCalledExactlyOnceWith('stuck-1');
    expect(m.claim.mock.calls.map((c) => c[0])).toEqual(['pending-1', 'stuck-1']);
    const staleBefore = (m.list.mock.calls[0] as unknown[])[1];
    expect(Date.now() - (staleBefore as Date).getTime()).toBeGreaterThanOrEqual(15 * 60_000 - 1000);
  });
});
