import sv from "../../messages/sv.json";
import { formatDayMonth, weekdayOf } from "../../src/lib/dates";
import { isoWeek } from "../../src/lib/weeks";

/** The weekday's name as the interface shows it, e.g. "Måndag". */
export function weekdayName(date: string): string {
  return sv.Weekdays[`d${weekdayOf(date)}` as keyof typeof sv.Weekdays];
}

/** A session's name on the week page, e.g. "Måndag 3 mars". */
export function sessionName(date: string): string {
  return `${weekdayName(date)} ${formatDayMonth(date)}`;
}

/** ISO week number of a date. */
export function weekNumber(date: string): number {
  return isoWeek(date).week;
}

export { formatDayMonth };
