import { defaultLocale } from "@/i18n/config";

/** Day and short month of a `YYYY-MM-DD` date in the interface language, e.g. "2 sep.". */
export function formatDayMonth(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(defaultLocale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** ISO weekday of a `YYYY-MM-DD` date: Monday = 1 ... Sunday = 7. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

/** "17:00:00" or "17:00" as "17:00"; null stays null. */
export function shortTime(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

/** Day and full month of a `YYYY-MM-DD` date, e.g. "2 september". */
export function formatDayMonthLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(defaultLocale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
