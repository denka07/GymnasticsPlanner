/**
 * Week helpers. Dates are `YYYY-MM-DD` strings; weeks are identified by the
 * date of their Monday. All arithmetic is done in UTC, so results do not
 * depend on the time zone of the machine.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(date: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) {
    throw new Error(`Invalid date: ${date}`);
  }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    throw new Error(`Invalid date: ${date}`);
  }
  return ms;
}

function format(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO weekday of a date: Monday = 1 ... Sunday = 7. */
function weekdayOf(ms: number): number {
  return new Date(ms).getUTCDay() || 7;
}

/** The Monday of the week that contains `date`. */
export function mondayOf(date: string): string {
  const ms = parse(date);
  return format(ms - (weekdayOf(ms) - 1) * DAY_MS);
}

export function isMonday(date: string): boolean {
  return weekdayOf(parse(date)) === 1;
}

/** ISO 8601 week number and week-numbering year of a date. */
export function isoWeek(date: string): { year: number; week: number } {
  const ms = parse(date);
  // The Thursday of the same week decides the ISO year.
  const thursday = ms + (4 - weekdayOf(ms)) * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.floor((thursday - jan1) / DAY_MS / 7) + 1;
  return { year, week };
}

/** The Monday of ISO week `week` in ISO year `year`. */
export function mondayOfIsoWeek(year: number, week: number): string {
  // 4 January is always in week 1.
  const jan4 = Date.UTC(year, 0, 4);
  const week1Monday = jan4 - (weekdayOf(jan4) - 1) * DAY_MS;
  return format(week1Monday + (week - 1) * 7 * DAY_MS);
}

export function addWeeks(date: string, n: number): string {
  return format(parse(date) + n * 7 * DAY_MS);
}

/** Every Monday from `firstMonday` to `lastMonday`, inclusive. */
export function weeksBetween(firstMonday: string, lastMonday: string): string[] {
  const first = parse(firstMonday);
  const last = parse(lastMonday);
  const weeks: string[] = [];
  for (let ms = first; ms <= last; ms += 7 * DAY_MS) {
    weeks.push(format(ms));
  }
  return weeks;
}

/** The date of `weekday` (Monday = 1 ... Sunday = 7) in the week starting `monday`. */
export function weekdayDate(monday: string, weekday: number): string {
  if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new Error(`Invalid weekday: ${weekday}`);
  }
  return format(parse(monday) + (weekday - 1) * DAY_MS);
}
