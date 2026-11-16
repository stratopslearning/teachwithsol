/**
 * Re-indexing must not wipe a material's existing search chunks when the
 * embedding call fails: embed first, then replace.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  embed: vi.fn(),
  deleteChunks: vi.fn(async () => 1),
  insertChunks: vi.fn(async () => 1),
  setStatus: vi.fn(async () => undefined),
}));

vi.mock('@/lib/knowledge/embed', () => ({ embedTexts: m.embed }));
vi.mock('@/lib/knowledge/extract', () => ({
  extractTextFromUrl: async () => 'Photosynthesis converts light into chemical energy in plants. '.repeat(5),
  extractTextFromUpload: async () => '',
}));
vi.mock('@/lib/knowledge/storage', () => ({ getMaterialObjectBytes: async () => Buffer.from('') }));
vi.mock('@/lib/db/knowledgeJobDefiners', () => ({
  claimCourseMaterialDefiner: async () => ({
    id: 'mat-1',
    courseId: 'course-1',
    sourceType: 'URL',
    externalUrl: 'https://example.edu/notes',
    s3Key: null,
  }),
  deleteCourseMaterialChunksDefiner: m.deleteChunks,
  insertCourseMaterialChunksDefiner: m.insertChunks,
  listPendingCourseMaterialsDefiner: async () => [],
  setCourseMaterialStatusDefiner: m.setStatus,
}));
vi.mock('@/lib/workspace', () => ({
  getCourseWorkspaceId: async () => 'ws-1',
  checkAiBandAvailable: async () => ({ ok: true }),
  recordAiUsage: async () => undefined,
}));

import { processMaterial } from '@/lib/knowledge/process';

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockClear();
});

describe('processMaterial re-index', () => {
  it('keeps the existing chunks when embedding fails', async () => {
    m.embed.mockRejectedValueOnce(new Error('embedding API down'));
    await processMaterial('mat-1');
    expect(m.deleteChunks).not.toHaveBeenCalled();
    expect(m.insertChunks).not.toHaveBeenCalled();
    expect(m.setStatus).toHaveBeenCalledWith('mat-1', 'FAILED', 'embedding API down');
  });

  it('replaces the chunks once embedding succeeds', async () => {
    m.embed.mockImplementationOnce(async (texts: string[]) => texts.map(() => [0.1, 0.2]));
    await processMaterial('mat-1');
    expect(m.deleteChunks).toHaveBeenCalledWith('mat-1');
    expect(m.insertChunks).toHaveBeenCalledOnce();
    expect(m.deleteChunks.mock.invocationCallOrder[0]).toBeLessThan(
      m.insertChunks.mock.invocationCallOrder[0],
    );
    expect(m.setStatus).toHaveBeenCalledWith('mat-1', 'READY', null);
  });
});
