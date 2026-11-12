export type AccessLevel = "owner" | "edit" | "view";
export type MinimumAccess = "view" | "edit";

const RANK: Record<AccessLevel, number> = { view: 1, edit: 2, owner: 3 };

/** True when the level lets the user change content (owner or edit). */
export function canEdit(level: AccessLevel | null): boolean {
  return level !== null && RANK[level] >= RANK.edit;
}

/** True when the level lets the user read content (any level). */
export function canView(level: AccessLevel | null): boolean {
  return level !== null;
}

/** True when `level` is at least `minimum`. No access never satisfies it. */
export function meetsMinimum(
  level: AccessLevel | null,
  minimum: MinimumAccess,
): boolean {
  return level !== null && RANK[level] >= RANK[minimum];
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs are untrusted; a malformed one must mean "no access". */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
