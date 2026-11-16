import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  interactive: null as null | Record<string, unknown>,
  hasBinding: vi.fn(async () => false),
}));

vi.mock('@/lib/authz/authorize', () => ({
  authorize: async () => false,
  userHasAnyBinding: m.hasBinding,
}));
vi.mock('@/lib/authz/courseAccess', () => ({ authorizeOnSection: async () => false }));
vi.mock('@/lib/authoring/access', () => ({ listTeachableSectionIdsForCourse: async () => [] }));
vi.mock('@/lib/db/bookWriteDefiners', () => ({ fetchActiveSectionIdsForStudentDefiner: async () => [] }));
vi.mock('@/lib/db/facultyWriteDefiners', () => ({ fetchInteractiveSectionIdsDefiner: async () => [] }));
vi.mock('@/lib/db/studentReadDefiners', () => ({
  fetchInteractiveByIdDefiner: async () => m.interactive,
}));

import { assertCanManageInteractive } from '@/lib/interactives/access';

const author = { id: 'author-1' };

beforeEach(() => {
  m.hasBinding.mockReset();
  m.hasBinding.mockResolvedValue(false);
});

describe('assertCanManageInteractive: authorship', () => {
  it('denies the author of a tenantless row (no teaching check possible)', async () => {
    m.interactive = { id: 'i1', professorId: 'author-1', tenantId: null, offeringId: null };
    await expect(assertCanManageInteractive(author, 'i1')).rejects.toMatchObject({ status: 403 });
  });

  it('denies an author without a teaching binding in the tenant', async () => {
    m.interactive = { id: 'i1', professorId: 'author-1', tenantId: 't1', offeringId: null };
    await expect(assertCanManageInteractive(author, 'i1')).rejects.toMatchObject({ status: 403 });
  });

  it('allows an author who still teaches in the tenant', async () => {
    m.interactive = { id: 'i1', professorId: 'author-1', tenantId: 't1', offeringId: null };
    m.hasBinding.mockResolvedValue(true);
    await expect(assertCanManageInteractive(author, 'i1')).resolves.toMatchObject({ id: 'i1' });
  });
});
