/**
 * Offering lifecycle (Wave 3 item 23).
 *
 * Ended / archived offerings are READ-ONLY for students: no new enrollment and
 * no new attempt submissions. Instructors keep read access (grading, exports)
 * through the normal authz path; this module only gates student write paths.
 */
import { eq } from 'drizzle-orm';

import { fetchSectionById } from '@/lib/db/entityScopedReads';
import { withTenant } from '@/lib/db/tenantContext';
import { courseOfferings } from '@/app/db/schema';
import { normalizeDatabaseDate } from '@/lib/utils';

export const OFFERING_ENDED_MESSAGE =
  'This course offering has ended and is read-only.';

export class OfferingEndedError extends Error {
  readonly code = 'OFFERING_ENDED';
  constructor(message = OFFERING_ENDED_MESSAGE) {
    super(message);
    this.name = 'OfferingEndedError';
  }
}

export type OfferingLifecycleFields = {
  status?: 'draft' | 'active' | 'ended' | 'archived' | string | null;
  endsAt?: Date | string | null;
};

/** Pure: is the offering read-only at `now`? */
export function isOfferingEnded(
  offering: OfferingLifecycleFields | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!offering) return false;
  if (offering.status === 'ended' || offering.status === 'archived') {
    return true;
  }
  const endsAt = normalizeDatabaseDate(offering.endsAt ?? null);
  if (!endsAt) return false;
  return now.getTime() > endsAt.getTime();
}

export async function assertOfferingWritable(
  offeringId: string | null | undefined,
  tenantId: string,
  now: Date = new Date(),
): Promise<void> {
  if (!offeringId) return;
  // FORCE RLS: a plain db read found no offering, so this guard never fired
  // and ended offerings still accepted writes. Read under the tenant.
  const offering = await withTenant(tenantId, null, (tx) =>
    tx.query.courseOfferings.findFirst({
      where: eq(courseOfferings.id, offeringId),
      columns: { status: true, endsAt: true },
    }),
  );
  if (isOfferingEnded(offering, now)) throw new OfferingEndedError();
}

/** Resolve the section's offering and assert it is writable. */
export async function assertSectionOfferingWritable(
  sectionId: string,
  now: Date = new Date(),
): Promise<void> {
  const section = await fetchSectionById(sectionId);
  const tenantId = section?.tenantId ?? section?.workspaceId;
  if (!tenantId) return;
  await assertOfferingWritable(section?.offeringId, tenantId, now);
}
