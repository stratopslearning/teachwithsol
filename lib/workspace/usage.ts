import { and, eq, sql } from 'drizzle-orm';

import { withTenant } from '@/lib/db/tenantContext';
import { workspaceUsageDaily } from '@/app/db/schema';
import { recordProcessAiBudget } from '@/lib/ai/budget';
import { getActiveLicense } from '@/lib/workspace/access';

export type AiUsageKind = 'grade' | 'tutor' | 'embed';

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Increment daily usage counters (fire-and-forget safe). */
export async function recordAiUsage(
  workspaceId: string,
  kind: AiUsageKind,
  units = 1,
): Promise<void> {
  if (!workspaceId || units <= 0) return;
  recordProcessAiBudget(workspaceId, units);
  const day = utcDay();
  const grade = kind === 'grade' ? units : 0;
  const tutor = kind === 'tutor' ? units : 0;
  const embed = kind === 'embed' ? units : 0;

  // FORCE RLS: a plain insert was rejected / matched nothing, so AI usage
  // was never recorded and per-workspace AI caps could never trip.
  await withTenant(workspaceId, null, (tx) =>
    tx
      .insert(workspaceUsageDaily)
      .values({
        workspaceId,
        day,
        gradeUnits: grade,
        tutorUnits: tutor,
        embedUnits: embed,
      })
      .onConflictDoUpdate({
        target: [workspaceUsageDaily.workspaceId, workspaceUsageDaily.day],
        set: {
          gradeUnits: sql`${workspaceUsageDaily.gradeUnits} + ${grade}`,
          tutorUnits: sql`${workspaceUsageDaily.tutorUnits} + ${tutor}`,
          embedUnits: sql`${workspaceUsageDaily.embedUnits} + ${embed}`,
          updatedAt: new Date(),
        },
      }),
  );
}

export async function sumUsageInPeriod(
  workspaceId: string,
  fromDay: string,
  toDay: string,
): Promise<number> {
  const rows = await withTenant(workspaceId, null, (tx) =>
    tx
      .select({
        total: sql<number>`coalesce(sum(${workspaceUsageDaily.gradeUnits} + ${workspaceUsageDaily.tutorUnits} + ${workspaceUsageDaily.embedUnits}), 0)::int`,
      })
      .from(workspaceUsageDaily)
      .where(
        and(
          eq(workspaceUsageDaily.workspaceId, workspaceId),
          sql`${workspaceUsageDaily.day} >= ${fromDay}`,
          sql`${workspaceUsageDaily.day} <= ${toDay}`,
        ),
      ),
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Soft AI-band check. Returns ok unless license has aiUnitCap and period usage
 * is at/over cap. Missing cap = unlimited.
 */
export async function assertAiBandAvailable(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; used: number; cap: number; reason: string }> {
  const license = await getActiveLicense(workspaceId);
  if (!license?.aiUnitCap || license.aiUnitCap <= 0) {
    return { ok: true };
  }
  const start = license.periodStart
    ? license.periodStart.toISOString().slice(0, 10)
    : utcDay(new Date(Date.now() - 30 * 86400000));
  const end = license.periodEnd
    ? license.periodEnd.toISOString().slice(0, 10)
    : utcDay();
  const used = await sumUsageInPeriod(workspaceId, start, end);
  if (used >= license.aiUnitCap) {
    return {
      ok: false,
      used,
      cap: license.aiUnitCap,
      reason: `AI usage limit reached (${used}/${license.aiUnitCap}).`,
    };
  }
  return { ok: true };
}

/** Soft-warn threshold (80%). */
export async function aiBandWarning(
  workspaceId: string,
): Promise<{ warn: boolean; used: number; cap: number | null }> {
  const license = await getActiveLicense(workspaceId);
  if (!license?.aiUnitCap || license.aiUnitCap <= 0) {
    return { warn: false, used: 0, cap: null };
  }
  const start = license.periodStart
    ? license.periodStart.toISOString().slice(0, 10)
    : utcDay(new Date(Date.now() - 30 * 86400000));
  const end = license.periodEnd
    ? license.periodEnd.toISOString().slice(0, 10)
    : utcDay();
  const used = await sumUsageInPeriod(workspaceId, start, end);
  return {
    warn: used >= license.aiUnitCap * 0.8,
    used,
    cap: license.aiUnitCap,
  };
}
