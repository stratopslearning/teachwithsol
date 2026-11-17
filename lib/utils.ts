import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import { fromZonedTime, toZonedTime, formatInTimeZone } from 'date-fns-tz'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a date to show both date and time in a user-friendly format
 * This function is backward compatible and assumes dates are already in local timezone
 * For new timezone-aware functionality, use formatUTCToLocal instead
 */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return 'Not set';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return 'Invalid date';
  
  // Check if the date has time information (not just midnight)
  const hasTime = dateObj.getHours() !== 0 || dateObj.getMinutes() !== 0;
  
  if (hasTime) {
    return dateObj.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } else {
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

/**
 * Normalize a date from the database to a UTC Date object
 * Database timestamps are stored as UTC, but when retrieved they might be:
 * - Strings without timezone info (e.g., "2025-12-21 21:00:00") - need to treat as UTC
 * - Date objects that were incorrectly constructed as local time
 * This function ensures we always get a proper UTC Date object
 */
export function normalizeDatabaseDate(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  
  if (typeof date === 'string') {
    const dateStr = date.trim();
    // Check if string has timezone indicator
    const hasTimezone = dateStr.endsWith('Z') || 
                        /[+-]\d{2}:?\d{2}$/.test(dateStr) || 
                        dateStr.includes('GMT');
    
    if (!hasTimezone) {
      // No timezone indicator - treat as UTC (database timestamps are stored as UTC)
      if (dateStr.includes('T')) {
        // String like "2025-12-21T21:00:00" - append Z to treat as UTC
        return new Date(dateStr + 'Z');
      } else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(dateStr)) {
        // String like "2025-12-21 21:00:00" - convert to ISO format and append Z
        return new Date(dateStr.replace(' ', 'T').replace(/\.\d+$/, '') + 'Z');
      } else {
        // Try to parse as-is
        return new Date(dateStr);
      }
    } else {
      // Has timezone indicator - parse normally
      return new Date(dateStr);
    }
  } else {
    // It's a Date object
    // If it was incorrectly constructed from a string without timezone, we can't easily detect it
    // But we can reconstruct it from its UTC components to ensure it's correct
    // This handles the case where Drizzle might have created a Date from a string without timezone
    const utcYear = date.getUTCFullYear();
    const utcMonth = date.getUTCMonth();
    const utcDay = date.getUTCDate();
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    const utcSeconds = date.getUTCSeconds();
    const utcMs = date.getUTCMilliseconds();
    
    // Reconstruct as UTC to ensure correctness
    return new Date(Date.UTC(utcYear, utcMonth, utcDay, utcHours, utcMinutes, utcSeconds, utcMs));
  }
}

/**
 * Format a date to show both date and time in local timezone
 * Uses local timezone methods - displays what the user sees
 */
export function formatDateTimeUTC(date: Date | string | null | undefined): string {
  if (!date) return 'Not set';
  
  // Normalize the date to ensure it's treated as UTC
  const dateObj = normalizeDatabaseDate(date);
  if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid date';
  
  // Check if the date has time information (not just midnight UTC)
  // Use UTC methods to check, but display in local time
  const hasTime = dateObj.getUTCHours() !== 0 || dateObj.getUTCMinutes() !== 0 || 
                  dateObj.getUTCSeconds() !== 0 || dateObj.getUTCMilliseconds() !== 0;
  
  if (hasTime) {
    // Use local timezone formatting - toLocaleString automatically converts UTC to local
    // This ensures the time the user entered (e.g., 2 PM) is displayed as 2 PM in their timezone
    // The Date object internally stores UTC, and toLocaleString converts it to the user's local timezone
    return dateObj.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } else {
    return dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
}

/**
 * Format a timestamp in an explicit IANA timezone, including a short zone
 * name so a 11:59 PM deadline is unambiguous across campuses.
 *
 * Pass the viewer's timezone (browser / request cookie). Default UTC is only
 * for tests and callers that have not resolved a zone yet.
 */
export function formatDateTimeStable(
  date: Date | string | null | undefined,
  timeZone = 'UTC',
): string {
  const dateObj = normalizeDatabaseDate(date);
  if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid date';
  return formatInTimeZone(dateObj, timeZone, 'MMM d, yyyy, h:mm aa zzz');
}

/** Time + short zone, for stacked table labels. */
export function formatTimeStable(
  date: Date | string | null | undefined,
  timeZone = 'UTC',
): string {
  const dateObj = normalizeDatabaseDate(date);
  if (!dateObj || isNaN(dateObj.getTime())) return 'Invalid date';
  return formatInTimeZone(dateObj, timeZone, 'h:mm aa zzz');
}

/** SSR-safe date-only formatting (explicit timezone). */
export function formatDateStable(
  date: Date | string | null | undefined,
  timeZone = 'UTC',
): string | null {
  const dateObj = normalizeDatabaseDate(date);
  if (!dateObj || isNaN(dateObj.getTime())) return null;
  return formatInTimeZone(dateObj, timeZone, 'MMM d, yyyy');
}

/**
 * Format a date to show only the time
 */
export function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '';
  
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  if (isNaN(dateObj.getTime())) return '';
  
  return dateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

// Generate unique 6-character enrollment code (cryptographically random).
export function generateEnrollmentCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 10;
  // Rejection sampling avoids modulo bias on 36-char alphabet.
  const out: string[] = [];
  while (out.length < length) {
    const bytes = new Uint8Array(length - out.length);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= 252) continue; // 252 = 7 * 36
      out.push(chars.charAt(b % 36));
      if (out.length >= length) break;
    }
  }
  return out.join('');
}

// Generate unique enrollment codes for sections
export function generateSectionEnrollmentCodes(): { professorCode: string; studentCode: string } {
  const professorCode = generateEnrollmentCode();
  // Generate student code with 'S' suffix to ensure uniqueness
  const studentCode = generateEnrollmentCode() + 'S';
  return { professorCode, studentCode };
}

/**
 * Convert a local date/time to UTC for database storage
 * @param localDate - Date object in local timezone
 * @param timezone - Timezone string (e.g., 'America/New_York'). If not provided, uses browser timezone
 * @returns Date object in UTC
 */
export function toUTC(localDate: Date, timezone?: string): Date {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fromZonedTime(localDate, tz);
}
