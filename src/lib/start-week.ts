/**
 * Pure logic for the start page's week view: which week is shown, and the
 * sessions of that week across seasons (stored sessions plus placeholders),
 * grouped by day. Kept free of React and the database for unit tests.
 */
import { weekSessions, type SlotLike, type StoredSessionLike } from "./week-sessions";
import { isMonday, weekdayDate } from "./weeks";

/**
 * The Monday to show from the `week` search parameter. Anything that is not a
 * valid Monday date (or is given more than once) falls back to `currentMonday`.
 */
export function parseWeekParam(value: string | string[] | undefined, currentMonday: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return currentMonday;
  }
  const year = Number(value.slice(0, 4));
  if (year < 2000 || year > 2100) {
    return currentMonday;
  }
  try {
    return isMonday(value) ? value : currentMonday;
  } catch {
    return currentMonday;
  }
}

/** A season the user can see something in, with what the placeholders need. */
export type WeekSeasonInput = {
  seasonId: string;
  groupId: string;
  groupName: string;
  slots: readonly SlotLike[];
  isBreak: boolean;
  /** The shown week lies within the season's first and last week. */
  inRange: boolean;
  /** The user may open the season (and so its week page). */
  canOpenSeason: boolean;
};

/** A stored session of the shown week that the user may open. */
export type WeekStoredInput = StoredSessionLike & {
  seasonId: string;
  location: string | null;
  isCancelled: boolean;
  partCount: number;
};

export type WeekItemState = "planned" | "unplanned" | "cancelled";

export type WeekItem = {
  /** Unique within the list. */
  key: string;
  date: string;
  startTime: string | null;
  location: string | null;
  groupId: string;
  groupName: string;
  seasonId: string;
  /** Null for a placeholder that is not stored yet. */
  sessionId: string | null;
  state: WeekItemState;
};

function compareItems(a: WeekItem, b: WeekItem): number {
  const ka = [a.date, a.startTime ?? "~", a.groupName, a.key];
  const kb = [b.date, b.startTime ?? "~", b.groupName, b.key];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

/**
 * Every session of the week starting `monday` across the given seasons, in
 * date and time order. Placeholders follow the week page's rules (weekSessions):
 * none in break weeks, none outside the season, none where a stored session
 * already fills the slot, and none for seasons the user cannot open.
 * `stored` holds only sessions the user may open.
 */
export function weekItems(
  monday: string,
  seasons: readonly WeekSeasonInput[],
  stored: readonly WeekStoredInput[],
): WeekItem[] {
  const items: WeekItem[] = [];
  for (const season of seasons) {
    const own = stored.filter((s) => s.seasonId === season.seasonId);
    const placeholders = season.inRange && season.canOpenSeason;
    const entries = weekSessions(placeholders ? season.slots : [], monday, season.isBreak, own);
    for (const entry of entries) {
      if (entry.kind === "stored") {
        const s = entry.session;
        items.push({
          key: s.id,
          date: s.date,
          startTime: s.startTime,
          location: s.location,
          groupId: season.groupId,
          groupName: season.groupName,
          seasonId: season.seasonId,
          sessionId: s.id,
          state: s.isCancelled ? "cancelled" : s.partCount > 0 ? "planned" : "unplanned",
        });
      } else {
        const p = entry.placeholder;
        items.push({
          key: `${season.seasonId}:${p.trainingSlotId}`,
          date: p.date,
          startTime: p.startTime,
          location: p.location,
          groupId: season.groupId,
          groupName: season.groupName,
          seasonId: season.seasonId,
          sessionId: null,
          state: "unplanned",
        });
      }
    }
  }
  return items.sort(compareItems);
}

export type DayGroup<T extends { date: string }> = { date: string; items: T[] };

/** Groups date-sorted items by day; days without items are left out. */
export function groupByDay<T extends { date: string }>(items: readonly T[]): DayGroup<T>[] {
  const days: DayGroup<T>[] = [];
  for (const item of items) {
    const last = days.at(-1);
    if (last && last.date === item.date) {
      last.items.push(item);
    } else {
      days.push({ date: item.date, items: [item] });
    }
  }
  return days;
}

/** The last day (Sunday) of the week starting `monday`. */
export function weekEnd(monday: string): string {
  return weekdayDate(monday, 7);
}
