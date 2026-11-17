/**
 * Section conclude / archive helpers (Canvas-style).
 *
 * When `sections.endsAt` is set and now is past that instant, the section is
 * concluded for students: hidden from active lists, available under Past /
 * Archived, and blocked for new quiz/discussion work.
 */
import { normalizeDatabaseDate } from '@/lib/utils';

export type SectionWithEndsAt = {
  endsAt?: Date | string | null;
};

export const SECTION_CONCLUDED_MESSAGE =
  'This section has ended. New work is no longer accepted.';

export function isSectionConcluded(
  section: SectionWithEndsAt | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!section) return false;
  const endsAt = normalizeDatabaseDate(section.endsAt ?? null);
  if (!endsAt) return false;
  return now.getTime() > endsAt.getTime();
}

/** Parse optional endsAt ISO from API bodies. Empty / null clears the field. */
export function parseOptionalEndsAt(
  value: unknown,
): { ok: true; endsAt: Date | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, endsAt: null };
  if (value === null || value === '') return { ok: true, endsAt: null };
  if (typeof value !== 'string') {
    return { ok: false, error: 'endsAt must be an ISO date string or null' };
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid endsAt date' };
  }
  return { ok: true, endsAt: date };
}

export function partitionBySectionConclusion<T extends SectionWithEndsAt>(
  items: T[],
  now: Date = new Date(),
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const item of items) {
    if (isSectionConcluded(item, now)) archived.push(item);
    else active.push(item);
  }
  return { active, archived };
}

/** Enrollment rows that embed a section with optional endsAt. */
export function partitionEnrollmentsByConclusion<
  T extends { section: SectionWithEndsAt | null },
>(enrollments: T[], now: Date = new Date()): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];
  for (const row of enrollments) {
    if (row.section && isSectionConcluded(row.section, now)) {
      archived.push(row);
    } else {
      active.push(row);
    }
  }
  return { active, archived };
}
