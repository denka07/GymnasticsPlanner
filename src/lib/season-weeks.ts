/**
 * Conversion between what the season form shows (ISO year + week number) and
 * what is stored (the Monday of the week).
 */
import { isoWeek, mondayOfIsoWeek, weeksBetween } from "./weeks";

export type WeekInput = { year: number; week: number };

/** Longest season the form accepts, in weeks. */
export const MAX_SEASON_WEEKS = 60;

/** True when ISO year `year` has a week number `week` (week 53 only some years). */
export function isValidIsoWeek({ year, week }: WeekInput): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(week)) {
    return false;
  }
  if (year < 2000 || year > 2100 || week < 1 || week > 53) {
    return false;
  }
  return isoWeek(mondayOfIsoWeek(year, week)).week === week;
}

/** The Monday stored for a week entered as year + week number. */
export function weekInputToMonday(input: WeekInput): string {
  if (!isValidIsoWeek(input)) {
    throw new Error(`Invalid ISO week: ${input.year}-W${input.week}`);
  }
  return mondayOfIsoWeek(input.year, input.week);
}

/** The year + week number shown for a stored Monday. */
export function mondayToWeekInput(monday: string): WeekInput {
  return isoWeek(monday);
}

/** Number of weeks from `firstMonday` to `lastMonday`, inclusive; 0 if reversed. */
export function weekCount(firstMonday: string, lastMonday: string): number {
  return weeksBetween(firstMonday, lastMonday).length;
}
