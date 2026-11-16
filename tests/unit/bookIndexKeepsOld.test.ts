/** Re-indexing a book must not retire its current search material if the new index fails. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  index: vi.fn(),
  softDelete: vi.fn(async () => undefined),
  setMaterial: vi.fn(async () => undefined),
}));
vi.mock('@/lib/books/indexChapterMaterial', () => ({ indexBookAsMaterial: m.index }));
vi.mock('@/lib/db/bookWriteDefiners', () => ({ fetchHostedBookByIdDefiner: async () => null }));
vi.mock('@/lib/db/knowledgeJobDefiners', () => ({
  softDeleteCourseMaterialsDefiner: m.softDelete,
  setBookChaptersMaterialDefiner: m.setMaterial,
  fetchBookChaptersForRagDefiner: async () => [],
}));

import { indexBookChaptersAsSingleMaterial } from '@/lib/books/bookKnowledge';

const opts = {
  bookId: 'book-1',
  courseId: 'course-1',
  uploadedByUserId: 'u1',
  bookTitle: 'Biology',
  chapters: [{ title: 'Cells', markdown: 'Cells are the basic unit of life. '.repeat(20) }],
  priorMaterialIds: ['old-mat'],
};

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset();
});

describe('indexBookChaptersAsSingleMaterial', () => {
  it('keeps the previous material when indexing fails', async () => {
    m.index.mockRejectedValueOnce(new Error('embed failed'));
    expect(await indexBookChaptersAsSingleMaterial(opts)).toBeNull();
    expect(m.softDelete).not.toHaveBeenCalled();
  });

  it('retires the previous material after the new one is indexed', async () => {
    m.index.mockResolvedValueOnce('new-mat');
    expect(await indexBookChaptersAsSingleMaterial(opts)).toBe('new-mat');
    expect(m.softDelete).toHaveBeenCalledWith(['old-mat']);
  });
});
