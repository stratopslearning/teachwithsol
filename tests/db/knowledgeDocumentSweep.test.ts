/** sol_list_pending_knowledge_documents returns PENDING and stale PROCESSING documents only. */
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { knowledgeDocuments } from '@/app/db/schema';
import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { makeWorkspace } from '../helpers/factories';
import { withPinnedTenantDb } from '../helpers/rlsSetup';

const skip = !process.env.TEST_DATABASE_URL;

describe.skipIf(skip)('sol_list_pending_knowledge_documents', () => {
  let db: TestDb;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
    const ws = await makeWorkspace(db);
    const old = new Date(Date.now() - 60 * 60_000);
    const rows = [
      ['pending', 'PENDING', new Date()],
      ['staleProcessing', 'PROCESSING', old],
      ['freshProcessing', 'PROCESSING', new Date()],
      ['ready', 'READY', old],
    ] as const;
    await withPinnedTenantDb(db, ws.id, async (tdb) => {
      for (const [key, status, updatedAt] of rows) {
        ids[key] = randomUUID();
        await tdb.insert(knowledgeDocuments).values({
          id: ids[key],
          workspaceId: ws.id,
          tenantId: ws.id,
          title: `doc ${key}`,
          sourceKind: 'UPLOAD',
          status,
          updatedAt,
        } as typeof knowledgeDocuments.$inferInsert);
      }
    });
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it('lists PENDING and stale PROCESSING, not fresh PROCESSING or READY', async () => {
    const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
    const res = await db.execute(
      sql`SELECT sol_list_pending_knowledge_documents(500, ${staleBefore}::timestamptz) AS rows`,
    );
    const rows = ((res as unknown as { rows: { rows: { id: string }[] }[] }).rows[0].rows ?? []).map(
      (r) => r.id,
    );
    expect(rows).toContain(ids.pending);
    expect(rows).toContain(ids.staleProcessing);
    expect(rows).not.toContain(ids.freshProcessing);
    expect(rows).not.toContain(ids.ready);
  });
});
