/**
 * Integration test for the Stripe webhook idempotency invariant.
 *
 * The webhook handler MUST insert one row per Stripe event id into
 * `stripe_events`. A second delivery of the same event should never
 * re-process the payload (Stripe retries when our handler 5xxs).
 *
 * We simulate the dedup itself rather than spinning up the whole
 * webhook handler — that would require mocking signature verification,
 * the Stripe SDK, and Clerk all at once. The dedup contract is the
 * sensitive part; the rest is straightforward Stripe SDK glue.
 */
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { stripeEvents } from '@/app/db/schema';

import { closeTestDb, getTestDb, type TestDb } from '../helpers/db';
import { hasTestDb } from '@/tests/helpers/testDb';

const skip = !hasTestDb();

describe.skipIf(skip)('stripe webhook idempotency', () => {
  let db: TestDb;
  const eventId = `evt_test_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  beforeAll(() => {
    db = getTestDb();
  });

  afterAll(async () => {
    await db.delete(stripeEvents).where(eq(stripeEvents.eventId, eventId));
    await closeTestDb();
  });

  it('inserts the event once and rejects duplicates via unique constraint', async () => {
    await db.insert(stripeEvents).values({
      eventId,
      type: 'checkout.session.completed',
      payload: { id: eventId },
    });
    await expect(
      db.insert(stripeEvents).values({
        eventId,
        type: 'checkout.session.completed',
        payload: { id: eventId, replay: true },
      }),
    ).rejects.toThrow();
  });
});
