import { format as formatDate } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

export const PACIFIC_TIMEZONE = "America/Los_Angeles";

export function getPacificDate(): Date {
  return toZonedTime(new Date(), PACIFIC_TIMEZONE);
}

/**
 * Parse a date string or Date object in a timezone-safe way.
 * For date-only strings (YYYY-MM-DD), adds noon time to prevent day shifts.
 * For full ISO strings or Date objects, parses as-is.
 */
export function parseLocalDate(date: Date | string): Date {
  if (date instanceof Date) return date;
  // If it's just a date (YYYY-MM-DD), add noon time to prevent timezone shifts
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return new Date(date + 'T12:00:00');
  }
  // Otherwise parse as-is (handles ISO strings)
  return new Date(date);
}

// Alias for backwards compatibility and clarity
export const parseDateSafe = parseLocalDate;

export function formatPacificDate(date: Date | string, formatStr: string): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return formatInTimeZone(d, PACIFIC_TIMEZONE, formatStr);
}

export function getTodayPacific(): string {
  return formatInTimeZone(new Date(), PACIFIC_TIMEZONE, "yyyy-MM-dd");
}

export function formatDisplayDate(date: Date | string): string {
  return formatPacificDate(date, "MMM d, yyyy");
}

export function formatDisplayDateTime(date: Date | string): string {
  return formatPacificDate(date, "MMM d, yyyy 'at' h:mm a");
}
