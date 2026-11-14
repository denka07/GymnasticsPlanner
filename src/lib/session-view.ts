/**
 * Pure logic for the single-session page:
 * progress counting and neighbouring sessions. Kept free of React and the database so it can be unit-tested.
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
