import { format as formatDate } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

export const PACIFIC_TIMEZONE = "America/Los_Angeles";

export function getPacificDate(): Date {
  return toZonedTime(new Date(), PACIFIC_TIMEZONE);
}

export function formatPacificDate(date: Date | string, formatStr: string): string {
  const d = typeof date === "string" ? new Date(date) : date;
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
