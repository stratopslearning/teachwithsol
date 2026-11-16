import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { TEACHING_TENANT_TABLES } from '../helpers/teachingTenantTables';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('schema tenant_id on teaching tables', () => {
  let db: TestDb;

  beforeAll(() => {
    db = getTestDb();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it.each(TEACHING_TENANT_TABLES)(
    'public.%s has tenant_id column',
    async (tableName) => {
      const client = await db.$client.connect();
      try {
        const { rows } = await client.query<{ column_name: string }>(
          `SELECT column_name
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = $1
             AND column_name = 'tenant_id'`,
          [tableName],
        );
        expect(rows.length).toBe(1);
      } finally {
        client.release();
      }
    },
  );
});
