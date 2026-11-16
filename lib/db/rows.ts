/**
 * Helpers for raw `db.execute(sql…)` results (SECURITY DEFINER functions and
 * other raw SQL). The neon/pg drivers return either `{ rows }` or an array,
 * and jsonb / timestamptz values may arrive as strings.
 */

/** Rows from a `db.execute` result, whichever driver shape it has. */
export function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

/** A jsonb column that may arrive as a parsed value or a JSON string. */
export function parseJsonb<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return JSON.parse(raw) as T;
  return raw as T;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    return new Date(value);
  }
  return null;
}

/** A timestamp that may arrive as a Date or ISO string; null stays null. */
export function asDate(value: Date | string | number): Date;
export function asDate(value: unknown): Date | null;
export function asDate(value: unknown): Date | null {
  return toDate(value);
}

/** Like `asDate`, but missing/unparseable values become `fallback`. */
export function asDateOr(value: unknown, fallback: Date | (() => Date)): Date {
  return toDate(value) ?? (typeof fallback === 'function' ? fallback() : fallback);
}
