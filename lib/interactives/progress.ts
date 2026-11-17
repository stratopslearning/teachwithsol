import { and, eq } from 'drizzle-orm';

import { interactiveProgress } from '@/app/db/schema';
import { withTenant } from '@/lib/db/tenantContext';

/**
 * A student's progress row for an interactive, read under its tenant (a
 * plain db read finds nothing under FORCE RLS). Tenantless interactives
 * can't be read under RLS either, so they return undefined.
 */
export async function getInteractiveProgress(
  interactive: { id: string; tenantId?: string | null },
  studentId: string,
) {
  if (!interactive.tenantId) return undefined;
  return withTenant(interactive.tenantId, studentId, (tx) =>
    tx.query.interactiveProgress.findFirst({
      where: and(
        eq(interactiveProgress.interactiveId, interactive.id),
        eq(interactiveProgress.studentId, studentId),
      ),
    }),
  );
}
