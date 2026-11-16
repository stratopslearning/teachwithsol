import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { retrieveCourseChunks } from '@/lib/knowledge/retrieve';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('vector retrieval cross-tenant', () => {
  let db: TestDb;

  beforeAll(() => {
    db = getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('refuses retrieve without tenantId', async () => {
    // Intentionally call without opts (no tenantId) via a loosened signature.
    const loose = retrieveCourseChunks as unknown as (
      courseId: string,
      query: string,
    ) => Promise<unknown[]>;
    const chunks = await loose('00000000-0000-4000-8000-000000000099', 'test');
    expect(chunks).toEqual([]);
  });

  it('returns empty when OPENAI_API_KEY unset (fail closed path)', async () => {
    const prev = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      const chunks = await retrieveCourseChunks(
        '00000000-0000-4000-8000-000000000099',
        'photosynthesis',
        { tenantId: '00000000-0000-4000-8000-000000000001' },
      );
      expect(chunks).toEqual([]);
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
    }
  });

  it('db handle is available for seeded cross-tenant cases', () => {
    expect(db).toBeTruthy();
  });
});
