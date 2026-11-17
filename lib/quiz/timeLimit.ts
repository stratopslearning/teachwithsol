/**
 * Shared quiz time-limit calculations for start, submit, and client display.
 * Server routes are authoritative; client uses these only for countdown display.
 */

/** Grace period in minutes (LMS-style buffer for auto-submit / clock skew). */
export function getGraceMinutes(timeLimitMinutes: number | null | undefined): number {
  if (!timeLimitMinutes) return 0;
  return Math.max(2, Math.min(5, Math.ceil(timeLimitMinutes * 0.15)));
}

export function getEffectiveLimitMinutes(timeLimitMinutes: number | null | undefined): number {
  if (!timeLimitMinutes) return 0;
  return timeLimitMinutes + getGraceMinutes(timeLimitMinutes);
}

export function getElapsedSeconds(startedAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - startedAt.getTime()) / 1000));
}

export function getElapsedMinutes(startedAt: Date, now: Date = new Date()): number {
  return getElapsedSeconds(startedAt, now) / 60;
}

/** Remaining seconds until the nominal time limit (not including grace). */
export function getRemainingSeconds(
  timeLimitMinutes: number | null | undefined,
  startedAt: Date,
  now: Date = new Date(),
): number | null {
  if (!timeLimitMinutes) return null;
  const limitSeconds = timeLimitMinutes * 60;
  const elapsed = getElapsedSeconds(startedAt, now);
  return Math.max(0, limitSeconds - elapsed);
}

/** True when the nominal per-attempt timer has reached zero (ignores grace). */
export function isNominalTimeLimitReached(
  timeLimitMinutes: number | null | undefined,
  startedAt: Date,
  now: Date = new Date(),
): boolean {
  if (!timeLimitMinutes) return false;
  const remaining = getRemainingSeconds(timeLimitMinutes, startedAt, now);
  return remaining === 0;
}

/** True when elapsed time exceeds limit + grace (matches submit rejection). */
export function isTimeLimitExceeded(
  timeLimitMinutes: number | null | undefined,
  startedAt: Date,
  now: Date = new Date(),
): boolean {
  if (!timeLimitMinutes) return false;
  const elapsedMinutes = getElapsedMinutes(startedAt, now);
  const effectiveLimit = getEffectiveLimitMinutes(timeLimitMinutes);
  return elapsedMinutes > effectiveLimit;
}
