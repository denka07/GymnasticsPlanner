/** Pure helpers for up/down reordering of sorted lists. */

export type Direction = "up" | "down";

/**
 * The ids in their new order after moving `id` one step in `direction`.
 * Returns null when the id is missing or already at that end of the list.
 */
export function moveStep(
  ids: readonly string[],
  id: string,
  direction: Direction,
): string[] | null {
  const from = ids.indexOf(id);
  if (from === -1) {
    return null;
  }
  const to = direction === "up" ? from - 1 : from + 1;
  if (to < 0 || to >= ids.length) {
    return null;
  }
  const next = [...ids];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Sort orders 0, 1, 2 ... for the ids in the given order. */
export function sortOrders(
  ids: readonly string[],
): { id: string; sortOrder: number }[] {
  return ids.map((id, sortOrder) => ({ id, sortOrder }));
}
