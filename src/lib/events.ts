/**
 * Placing events in the weeks of a season plan. Pure, so it can be unit-tested.
 * Dates are `YYYY-MM-DD` strings; weeks are identified by their Monday.
 */
import type { EventType } from "@/db/schema";

import { weekdayDate } from "./weeks";

/** The order of the rows in the activities block. */
export const EVENT_TYPE_ORDER: readonly EventType[] = ["competition", "camp", "show", "other"];

/** The longest event name shown in full; longer names are truncated. */
export const MAX_LABEL_CHARS = 12;

/** Truncate a name to `max` characters (ellipsis included) when it is longer. */
export function truncateLabel(name: string, max: number = MAX_LABEL_CHARS): string {
  const chars = Array.from(name);
  if (chars.length <= max) {
    return name;
  }
  return (
    chars
      .slice(0, Math.max(0, max - 1))
      .join("")
      .trimEnd() + "…"
  );
}

/** How many characters of the longest name in `names` are shown (at most `max`). */
export function visibleLabelChars(names: readonly string[], max: number = MAX_LABEL_CHARS): number {
  return Math.min(max, Math.max(0, ...names.map((n) => Array.from(n).length)));
}

export type EventSpan = { startCol: number; endCol: number };

/**
 * The columns an event covers: the index of the first and last week (in
 * `weeks`, Mondays in order) that it touches, clipped to the visible weeks.
 * Null when the event is entirely outside them.
 */
export function eventColumns(
  weeks: readonly string[],
  startDate: string,
  endDate: string,
): EventSpan | null {
  let startCol = -1;
  let endCol = -1;
  weeks.forEach((monday, col) => {
    const sunday = weekdayDate(monday, 7);
    if (monday <= endDate && sunday >= startDate) {
      if (startCol === -1) {
        startCol = col;
      }
      endCol = col;
    }
  });
  return startCol === -1 ? null : { startCol, endCol };
}

export type PlacedEvent<E> = { event: E } & EventSpan;

export type EventRow<E> = {
  type: EventType;
  /**
   * Events of this type in lanes (lines of the row). Within a lane events
   * never overlap, except that single-week events in the same week share that
   * week's cell (several entries with the same `startCol`).
   */
  lanes: PlacedEvent<E>[][];
};

type EventLike = {
  name: string;
  type: EventType;
  startDate: string;
  endDate: string;
};

/**
 * One group of lanes per event type that has a visible event, in
 * EVENT_TYPE_ORDER. Lanes depend only on the weeks the events cover:
 * overlapping multi-week events get separate lanes, and single-week events
 * share a week's cell unless a multi-week event covers that week in the lane,
 * in which case they move to another lane.
 */
export function layoutEventRows<E extends EventLike>(
  weeks: readonly string[],
  events: readonly E[],
): EventRow<E>[] {
  const compare = (a: PlacedEvent<E>, b: PlacedEvent<E>) =>
    a.startCol - b.startCol || a.endCol - b.endCol || a.event.name.localeCompare(b.event.name);
  const rows: EventRow<E>[] = [];
  for (const type of EVENT_TYPE_ORDER) {
    const placed: PlacedEvent<E>[] = [];
    for (const event of events) {
      if (event.type !== type) {
        continue;
      }
      const span = eventColumns(weeks, event.startDate, event.endDate);
      if (span) {
        placed.push({ event, ...span });
      }
    }
    if (placed.length === 0) {
      continue;
    }
    placed.sort(compare);
    const lanes: PlacedEvent<E>[][] = [];
    // Per lane and column: taken by a multi-week event or by single-week ones.
    const used: Map<number, "multi" | "single">[] = [];
    const put = (lane: number, item: PlacedEvent<E>, kind: "multi" | "single") => {
      lanes[lane].push(item);
      for (let c = item.startCol; c <= item.endCol; c++) {
        used[lane].set(c, kind);
      }
    };
    const newLane = () => {
      lanes.push([]);
      used.push(new Map());
      return lanes.length - 1;
    };
    for (const item of placed.filter((p) => p.endCol > p.startCol)) {
      let lane = used.findIndex((u) => {
        for (let c = item.startCol; c <= item.endCol; c++) {
          if (u.has(c)) {
            return false;
          }
        }
        return true;
      });
      if (lane === -1) {
        lane = newLane();
      }
      put(lane, item, "multi");
    }
    for (const item of placed.filter((p) => p.endCol === p.startCol)) {
      let lane = used.findIndex((u) => u.get(item.startCol) !== "multi");
      if (lane === -1) {
        lane = newLane();
      }
      put(lane, item, "single");
    }
    for (const lane of lanes) {
      lane.sort(compare);
    }
    rows.push({ type, lanes });
  }
  return rows;
}
