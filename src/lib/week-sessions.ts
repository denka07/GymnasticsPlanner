/**
 * Which sessions a week has. Pure, so it can be unit-tested.
 *
 * A week shows every session stored in it, plus a placeholder ("not yet
 * planned") for each training slot that has no stored session in that week.
 * A placeholder is not stored; the first edit stores it, copying the slot's
 * date, times and location. Break weeks get no placeholders.
 */
import { mondayOf, weekdayDate } from "./weeks";

export type SlotLike = {
  id: string;
  weekday: number;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
};

export type StoredSessionLike = {
  id: string;
  date: string;
  startTime: string | null;
  trainingSlotId: string | null;
};

export type Placeholder = {
  trainingSlotId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
};

export type WeekEntry<S> =
  | { kind: "stored"; session: S }
  | { kind: "placeholder"; placeholder: Placeholder };

function sortKey(entry: WeekEntry<StoredSessionLike>): [string, string, number, string] {
  if (entry.kind === "stored") {
    const s = entry.session;
    // Sessions without a time sort after timed ones on the same day.
    return [s.date, s.startTime ?? "~", 0, s.id];
  }
  const p = entry.placeholder;
  return [p.date, p.startTime ?? "~", 1, p.trainingSlotId];
}

function compare(a: WeekEntry<StoredSessionLike>, b: WeekEntry<StoredSessionLike>): number {
  const ka = sortKey(a);
  const kb = sortKey(b);
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

/**
 * The sessions of the week starting `monday`, in date and time order.
 * `stored` may contain sessions from other weeks; they are ignored.
 */
export function weekSessions<S extends StoredSessionLike>(
  slots: readonly SlotLike[],
  monday: string,
  isBreak: boolean,
  stored: readonly S[],
): WeekEntry<S>[] {
  const inWeek = stored.filter((s) => mondayOf(s.date) === monday);
  const entries: WeekEntry<S>[] = inWeek.map((session) => ({ kind: "stored", session }));
  if (!isBreak) {
    const planned = new Set(inWeek.map((s) => s.trainingSlotId).filter((id) => id !== null));
    for (const slot of slots) {
      if (planned.has(slot.id)) {
        continue;
      }
      entries.push({
        kind: "placeholder",
        placeholder: {
          trainingSlotId: slot.id,
          date: weekdayDate(monday, slot.weekday),
          startTime: slot.startTime,
          endTime: slot.endTime,
          location: slot.location,
        },
      });
    }
  }
  return entries.sort(compare);
}
