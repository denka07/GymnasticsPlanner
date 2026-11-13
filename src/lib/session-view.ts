/**
 * Pure logic for the single-session page and the start page's "Nästa pass":
 * progress counting, neighbouring sessions and picking the next session of a
 * group. Kept free of React and the database so it can be unit-tested.
 */

export type TickPart = { isDone: boolean };

/** How many parts are done, and how many there are. Only parts are ticked off. */
export function progress(parts: readonly TickPart[]): { done: number; total: number } {
  return { done: parts.filter((p) => p.isDone).length, total: parts.length };
}

export type Dated = { id: string; date: string; startTime: string | null };

/** Date, then start time (sessions without a time last), then id. */
export function compareSessions(a: Dated, b: Dated): number {
  const ka = [a.date, a.startTime ?? "~", a.id];
  const kb = [b.date, b.startTime ?? "~", b.id];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] < kb[i]) return -1;
    if (ka[i] > kb[i]) return 1;
  }
  return 0;
}

/** The stored sessions just before and after `currentId`, by date and time. */
export function neighbours<S extends Dated>(
  all: readonly S[],
  currentId: string,
): { previous: S | null; next: S | null } {
  const sorted = [...all].sort(compareSessions);
  const index = sorted.findIndex((s) => s.id === currentId);
  if (index === -1) {
    return { previous: null, next: null };
  }
  return { previous: sorted[index - 1] ?? null, next: sorted[index + 1] ?? null };
}

export type NextCandidate = Dated & {
  groupId: string;
  isCancelled: boolean;
  partCount: number;
};

/**
 * For each group id, in the given order, its next session: not cancelled, with
 * at least one part, dated `today` or later. Groups without one are left out.
 * `today` is a `YYYY-MM-DD` date.
 */
export function nextSessions<S extends NextCandidate>(
  candidates: readonly S[],
  groupIds: readonly string[],
  today: string,
): S[] {
  const result: S[] = [];
  for (const groupId of groupIds) {
    const next = candidates
      .filter((c) => c.groupId === groupId && !c.isCancelled && c.partCount > 0 && c.date >= today)
      .sort(compareSessions)[0];
    if (next) {
      result.push(next);
    }
  }
  return result;
}

/** The current date in Sweden as `YYYY-MM-DD`. */
export function todayInStockholm(now: Date): string {
  // The Swedish-Canadian "en-CA" locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
