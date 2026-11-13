/**
 * Pure helpers for the library (exercises, stations, equipment). See the
 * "Library" section of docs/data-model.md.
 */

export type LibraryScope = "global" | "personal";

/** What a user may do with a library item: change it, only read it, or nothing. */
export type LibraryAccess = "edit" | "view" | null;

/**
 * A user's access to an exercise or station.
 *
 * - The owner of a personal item may view and edit it.
 * - A global item is visible to everyone and editable only by administrators.
 * - Nobody else may see a personal item.
 */
export function libraryAccess(
  item: { scope: LibraryScope; ownerId: string | null },
  user: { id: string; isAdmin: boolean },
): LibraryAccess {
  if (item.scope === "global") {
    return user.isAdmin ? "edit" : "view";
  }
  if (item.ownerId !== null && item.ownerId === user.id) {
    return "edit";
  }
  // TODO(shares): a personal item used in a session shared with the user is
  // readable through that share (step 5).
  return null;
}

/**
 * A search text as a pattern for SQL `ILIKE`, matching it anywhere in the
 * value. `%`, `_` and `\` in the text match themselves. Returns null for an
 * empty search.
 */
export function searchPattern(search: string | null | undefined): string | null {
  const trimmed = (search ?? "").trim();
  if (trimmed === "") {
    return null;
  }
  return `%${trimmed.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** True when `name` contains the search text, ignoring case. Empty search matches all. */
export function matchesSearch(name: string, search: string): boolean {
  const needle = search.trim().toLocaleLowerCase("sv");
  return needle === "" || name.toLocaleLowerCase("sv").includes(needle);
}

/** Sorts by name the way a Swedish reader expects (å, ä, ö last). */
export function byName<T extends { name: string }>(a: T, b: T): number {
  return a.name.localeCompare(b.name, "sv", { sensitivity: "base" });
}

/** True when `name` equals one of `names`, ignoring case and surrounding space. */
export function hasName(names: readonly string[], name: string): boolean {
  const wanted = name.trim().toLocaleLowerCase("sv");
  return names.some((n) => n.trim().toLocaleLowerCase("sv") === wanted);
}

export type EquipmentLine = { name: string; quantity: number };

/**
 * A station's needed equipment as one line, for example "2 × Tunnmatta, Plint".
 * A quantity of 1 is left out. Lines keep their given order.
 */
export function formatEquipmentLines(lines: readonly EquipmentLine[]): string {
  return lines
    .map((line) => (line.quantity > 1 ? `${line.quantity} × ${line.name}` : line.name))
    .join(", ");
}

/**
 * The Postgres error code (for example "23505" for a unique violation) of a
 * database error, looking through wrapping errors. Null when there is none.
 */
export function pgErrorCode(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === "object" && current !== null) {
      const code = (current as { code?: unknown }).code;
      if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) {
        return code;
      }
      current = (current as { cause?: unknown }).cause;
    } else {
      return null;
    }
  }
  return null;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
/** Raised instead of 23503 when a row referenced with ON DELETE RESTRICT is deleted. */
export const PG_RESTRICT_VIOLATION = "23001";

/** True for the errors Postgres raises when a referenced row cannot be deleted. */
export function isStillReferenced(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code === PG_FOREIGN_KEY_VIOLATION || code === PG_RESTRICT_VIOLATION;
}

/**
 * The items a picker offers: those not already chosen whose name contains the
 * search, by name, at most `limit` of them. With an empty search it offers the
 * first `limit` items.
 */
export function pickerMatches<T extends { id: string; name: string }>(
  items: readonly T[],
  chosenIds: readonly string[],
  search: string,
  limit = 8,
): T[] {
  const chosen = new Set(chosenIds);
  return items
    .filter((item) => !chosen.has(item.id) && matchesSearch(item.name, search))
    .sort(byName)
    .slice(0, limit);
}
