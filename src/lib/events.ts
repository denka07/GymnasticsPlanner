/**
 * Placing events in the weeks of a season plan. Pure, so it can be unit-tested.
 * Dates are `YYYY-MM-DD` strings; weeks are identified by their Monday.
 */
import type { EventType } from "@/db/schema";

import { weekdayDate } from "./weeks";

/** The order of the rows in the activities block. */
export const EVENT_TYPE_ORDER: readonly EventType[] = ["competition", "camp", "show", "other"];

/** Roughly how many characters of a label fit in one week column. */
const CHARS_PER_COLUMN = 5;

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
  /** Events of this type in separate lanes so that no two in a lane overlap. */
  lanes: PlacedEvent<E>[][];
};

type EventLike = { name: string; type: EventType; startDate: string; endDate: string };

/**
 * One group of lanes per event type that has a visible event, in
 * EVENT_TYPE_ORDER. Events that overlap in weeks, or whose label would run
 * into the next event's, go in different lanes.
 */
export function layoutEventRows<E extends EventLike>(
  weeks: readonly string[],
  events: readonly E[],
): EventRow<E>[] {
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
    placed.sort(
      (a, b) =>
        a.startCol - b.startCol || a.endCol - b.endCol || a.event.name.localeCompare(b.event.name),
    );
    const lanes: PlacedEvent<E>[][] = [];
    const laneEnds: number[] = [];
    for (const item of placed) {
      // A label wider than its columns takes up the columns after it too.
      const labelEnd = item.startCol + Math.ceil(item.event.name.length / CHARS_PER_COLUMN) - 1;
      const occupiedEnd = Math.max(item.endCol, labelEnd);
      const lane = laneEnds.findIndex((end) => end < item.startCol);
      if (lane === -1) {
        lanes.push([item]);
        laneEnds.push(occupiedEnd);
      } else {
        lanes[lane].push(item);
        laneEnds[lane] = occupiedEnd;
      }
    }
    rows.push({ type, lanes });
  }
  return rows;
}
