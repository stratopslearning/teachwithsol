/** sol_job_* definers: dedupe, exclusive claims, backoff, dead-lettering, lock expiry. */
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

type Row = { id: string; status: string; attempts: number; run_after: string; last_error: string | null };

describe.skipIf(skip)('job queue definers', () => {
  let db: TestDb;
  // A kind unique to this run so parallel suites never see each other's rows.
  const kind = `test_${randomUUID().slice(0, 8)}`;

  const rows = <T>(res: unknown) => (res as { rows: T[] }).rows;
  const enqueue = async (dedupe: string | null, max = 3) =>
    rows<{ id: string | null }>(
      await db.execute(
        sql`select sol_job_enqueue(${kind}, null, '{"x":1}'::jsonb, ${dedupe}, ${max}) as id`,
      ),
    )[0]!.id;
  const claim = async (limit: number, lockSeconds = 300) =>
    rows<Row>(
      await db.execute(
        sql`select * from sol_job_claim(${`{${kind}}`}::text[], ${limit}, ${lockSeconds})`,
      ),
    );
  const finish = async (id: string, error: string | null, retry = 0) =>
    rows<{ status: string }>(
      await db.execute(sql`select sol_job_finish(${id}::uuid, ${error}, ${retry}) as status`),
    )[0]!.status;
  const get = async (id: string) =>
    rows<Row>(await db.execute(sql`select * from job_queue where id = ${id}::uuid`))[0]!;

  beforeAll(() => {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
    db = getTestDb();
  });

  afterAll(async () => {
    await db.execute(sql`delete from job_queue where kind = ${kind}`);
    await closeTestDb();
  });

  it('keeps one waiting job per dedupe key, but allows one behind a running job', async () => {
    const first = await enqueue('a');
    expect(first).toBeTruthy();
    expect(await enqueue('a')).toBeNull();

    const [claimed] = await claim(1);
    expect(claimed!.id).toBe(first);
    // Running no longer blocks: work requested mid-run gets a follow-up job.
    const followUp = await enqueue('a');
    expect(followUp).toBeTruthy();
    expect(await finish(first!, null)).toBe('done');
    await claim(10).then((js) => Promise.all(js.map((j) => finish(j.id, null))));
  });

  it('never hands the same job to two concurrent claimers', async () => {
    const ids = await Promise.all(Array.from({ length: 6 }, () => enqueue(null)));
    const [a, b, c] = await Promise.all([claim(4), claim(4), claim(4)]);
    const claimed = [...a!, ...b!, ...c!].map((j) => j.id);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed.sort()).toEqual([...ids].sort());
    await Promise.all(claimed.map((id) => finish(id, null)));
  });

  it('retries a failed job after the backoff, then marks it dead at max attempts', async () => {
    const id = (await enqueue(null, 2))!;
    await claim(1);
    expect(await finish(id, 'boom', 3600)).toBe('queued');
    // Not ready again until run_after.
    expect(await claim(1)).toHaveLength(0);

    await db.execute(sql`update job_queue set run_after = now() where id = ${id}::uuid`);
    const [again] = await claim(1);
    expect(again!.attempts).toBe(2);
    expect(await finish(id, 'boom again', 0)).toBe('dead');
    expect((await get(id)).last_error).toBe('boom again');
  });

  it('reclaims a job whose worker died once its lock expires', async () => {
    const id = (await enqueue(null, 2))!;
    await claim(1);
    expect(await claim(1)).toHaveLength(0);

    await db.execute(sql`update job_queue set locked_until = now() - interval '1 second' where id = ${id}::uuid`);
    const [reclaimed] = await claim(1);
    expect(reclaimed!.id).toBe(id);
    expect(reclaimed!.attempts).toBe(2);

    // Expiring on the last allowed attempt is dead, not another retry.
    await db.execute(sql`update job_queue set locked_until = now() - interval '1 second' where id = ${id}::uuid`);
    expect(await claim(1)).toHaveLength(0);
    expect((await get(id)).status).toBe('dead');
  });
});
