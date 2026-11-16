'use client';

import { formatInTimeZone } from 'date-fns-tz';

import { useDisplayTimeZone } from '@/components/timezone/TimeZoneProvider';
import { normalizeDatabaseDate } from '@/lib/utils';

type DateInput = Date | string | null | undefined;

/**
 * Date labels for client components, in the viewer's time zone.
 *
 * Use this (or <LocalDateTime>) instead of `toLocale*`: those format in the
 * server's zone during SSR and the browser's after hydration, so the label
 * flips. Until the browser zone is known every formatter returns ''.
 */
export function useLocalDate() {
  const timeZone = useDisplayTimeZone();
  const fmt = (value: DateInput, pattern: string): string => {
    if (!timeZone) return '';
    const d = normalizeDatabaseDate(value);
    if (!d || Number.isNaN(d.getTime())) return '';
    return formatInTimeZone(d, timeZone, pattern);
  };
  return {
    /** "Mar 5, 2026" */
    date: (v: DateInput) => fmt(v, 'MMM d, yyyy'),
    /** "Mar 5" */
    shortDate: (v: DateInput) => fmt(v, 'MMM d'),
    /** "Mar 5, 2026, 3:04 PM" */
    dateTime: (v: DateInput) => fmt(v, 'MMM d, yyyy, h:mm aa'),
    /** "Mar 5, 3:04 PM" */
    shortDateTime: (v: DateInput) => fmt(v, 'MMM d, h:mm aa'),
    /** "3:04 PM" */
    time: (v: DateInput) => fmt(v, 'h:mm aa'),
  };
}
