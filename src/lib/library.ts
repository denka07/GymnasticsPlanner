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
 * - Nobody else may open a personal item in the library; a session that
 * links one shows it to everyone who can view that session.
 */
export function libraryAccess(
  item: LibraryItemRef,
  user: LibraryUser,
  { underReview = false }: { underReview?: boolean } = {},
): LibraryAccess {
  if (item.scope === "global") {
    return user.isAdmin ? "edit" : "view";
  }
  if (item.ownerId !== null && item.ownerId === user.id) {
    return "edit";
  }
  // An administrator reviews a submitted item by reading it in the library.
  if (underReview && user.isAdmin) {
    return "view";
  }
  // A personal item a shared session uses is shown with that session
  // (src/lib/data/session-view.ts), not through the library.
  return null;
}

export type LibraryItemRef = { scope: LibraryScope; ownerId: string | null };
export type LibraryUser = { id: string; isAdmin: boolean };

/** True when the user may find the item in the library and link it: global or their own. */
export function isVisibleInLibrary(item: LibraryItemRef, user: { id: string }): boolean {
  return item.scope === "global" || (item.ownerId !== null && item.ownerId === user.id);
}

function ownsPersonal(item: LibraryItemRef, user: { id: string }): boolean {
  return item.scope === "personal" && item.ownerId !== null && item.ownerId === user.id;
}

/**
 * Whether the user may add or remove the link "this station supports this
 * exercise". Both must be visible to them in the library, and:
 *
 * - between a global station and a global exercise, only administrators;
 * - otherwise the user must own the personal station or the personal
 *   exercise, so a coach can add their own exercise to a global station.
 *
 * Links the user may not change are left as they are when they save.
 */
export function canEditLink(
  station: LibraryItemRef,
  exercise: LibraryItemRef,
  user: LibraryUser,
): boolean {
  if (!isVisibleInLibrary(station, user) || !isVisibleInLibrary(exercise, user)) {
    return false;
  }
  if (station.scope === "global" && exercise.scope === "global") {
    return user.isAdmin;
  }
  return ownsPersonal(station, user) || ownsPersonal(exercise, user);
}

/**
 * What saving a list of links does: `wanted` is the full list of linked items
 * the user means among those they may change. Links they may not change are
 * kept whatever the list says. Returns null when the list contains an item
 * the user may not link (the save is then refused).
 */
export function planLinkChanges(
  current: readonly { id: string; editable: boolean }[],
  wanted: readonly string[],
  editableCandidates: ReadonlySet<string>,
): { add: string[]; remove: string[] } | null {
  const wantedSet = new Set(wanted);
  const currentIds = new Set(current.map((c) => c.id));
  const locked = new Set(current.filter((c) => !c.editable).map((c) => c.id));
  for (const id of wantedSet) {
    if (!locked.has(id) && !editableCandidates.has(id)) {
      return null;
    }
  }
  return {
    add: [...wantedSet].filter((id) => !currentIds.has(id)),
    remove: current.filter((c) => c.editable && !wantedSet.has(c.id)).map((c) => c.id),
  };
}

// --- Global items and review ---------------------------------------------------

export type SubmissionStatus = "pending" | "approved" | "rejected";

/** Only administrators create global items. */
export function canCreateWithScope(scope: LibraryScope, user: LibraryUser): boolean {
  return scope === "personal" || user.isAdmin;
}

/** Anyone may copy a global item into a personal one of their own. */
export function canCopy(item: LibraryItemRef): boolean {
  return item.scope === "global";
}

/** An administrator may turn their own personal item global without review. */
export function canMakeGlobal(item: LibraryItemRef, user: LibraryUser): boolean {
  return user.isAdmin && ownsPersonal(item, user);
}

/**
 * A coach may submit their own personal item for review when it has no
 * pending submission. Administrators make their items global directly.
 */
export function canSubmit(
  item: LibraryItemRef,
  user: LibraryUser,
  hasPendingSubmission: boolean,
): boolean {
  return !user.isAdmin && ownsPersonal(item, user) && !hasPendingSubmission;
}

/** The submitter may withdraw their submission while it is pending. */
export function canWithdraw(
  submission: { status: SubmissionStatus; submittedBy: string },
  user: { id: string },
): boolean {
  return submission.status === "pending" && submission.submittedBy === user.id;
}

/**
 * Administrators approve or reject pending submissions of items that are
 * still personal.
 */
export function canReview(
  submission: { status: SubmissionStatus },
  item: LibraryItemRef,
  user: LibraryUser,
): boolean {
  return user.isAdmin && submission.status === "pending" && item.scope === "personal";
}

// --- Exercises that go global with a station -----------------------------------

/** An exercise considered for going global together with a station. */
export type StationExerciseCandidate = LibraryItemRef & {
  id: string;
  /** True when the station supports the exercise. */
  supported: boolean;
};

/**
 * Whether an exercise may go global together with a station submitted (or
 * made global) by `ownerId`: it must be personal, owned by that user and
 * supported by the station.
 */
export function canGoWithStation(exercise: StationExerciseCandidate, ownerId: string): boolean {
  return exercise.supported && ownsPersonal(exercise, { id: ownerId });
}

/**
 * The exercises a submitter includes in a station submission, from the ids
 * they ticked. Returns null when a ticked id is not one of the exercises they
 * may include (the submission is then refused). Duplicates are dropped.
 */
export function planIncludedExercises(
  candidates: readonly StationExerciseCandidate[],
  chosen: readonly string[],
  submitterId: string,
): string[] | null {
  const allowed = new Set(candidates.filter((c) => canGoWithStation(c, submitterId)).map((c) => c.id));
  const unique = [...new Set(chosen)];
  return unique.every((id) => allowed.has(id)) ? unique : null;
}

/**
 * The exercises that become global when a station submission is approved:
 * those the administrator ticked that the submitter included and that still
 * qualify (personal, the submitter's own, supported by the station). Anything
 * else is ignored, so nothing the submitter did not include becomes global.
 */
export function exercisesToApprove(
  included: readonly StationExerciseCandidate[],
  ticked: readonly string[],
  submitterId: string,
): string[] {
  const wanted = new Set(ticked);
  return included.filter((e) => wanted.has(e.id) && canGoWithStation(e, submitterId)).map((e) => e.id);
}

/**
 * The exercises that become global when an administrator makes their own
 * station global: those ticked that are their own personal exercises the
 * station supports. Others are ignored.
 */
export function exercisesToMakeGlobal(
  supported: readonly StationExerciseCandidate[],
  ticked: readonly string[],
  user: LibraryUser,
): string[] {
  if (!user.isAdmin) {
    return [];
  }
  return exercisesToApprove(supported, ticked, user.id);
}

/**
 * Whether a coach may submit an exercise on its own: as canSubmit, and not
 * while it is included in a pending station submission.
 */
export function canSubmitExercise(
  exercise: LibraryItemRef,
  user: LibraryUser,
  hasPendingSubmission: boolean,
  includedInPendingStation: boolean,
): boolean {
  return !includedInPendingStation && canSubmit(exercise, user, hasPendingSubmission);
}

/**
 * Splits the exercises included in an approved station submission into those
 * that are now global and those that stayed personal, for telling the
 * submitter.
 */
export function splitIncludedOutcome<T extends { scope: LibraryScope }>(
  included: readonly T[],
): { global: T[]; personal: T[] } {
  return {
    global: included.filter((e) => e.scope === "global"),
    personal: included.filter((e) => e.scope === "personal"),
  };
}

/** Only administrators are told who created a global item. */
export function canSeeCreator(user: LibraryUser): boolean {
  return user.isAdmin;
}

/**
 * The review status the submitter sees on their item: that of the newest
 * submission they made, or null when they have made none.
 */
export function submissionStatusFor<T extends { submittedAt: Date; submittedBy: string; status: SubmissionStatus }>(
  submissions: readonly T[],
  user: { id: string },
): T | null {
  let newest: T | null = null;
  for (const s of submissions) {
    if (s.submittedBy === user.id && (newest === null || s.submittedAt > newest.submittedAt)) {
      newest = s;
    }
  }
  return newest;
}

const SUBMISSION_DATE = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Stockholm",
});

/** A submission or review time as a Swedish date, for example "14 november 2026". */
export function formatSubmissionDate(date: Date): string {
  return SUBMISSION_DATE.format(date);
}

/** Which items a library list shows. */
export type ScopeFilter = "all" | "mine" | "global";

/** The filter from a URL value; anything unknown shows all. */
export function parseScopeFilter(value: unknown): ScopeFilter {
  return value === "mine" || value === "global" ? value : "all";
}

/** True when the item belongs in a list with this filter. */
export function matchesScopeFilter(
  item: LibraryItemRef,
  filter: ScopeFilter,
  user: { id: string },
): boolean {
  if (filter === "global") {
    return item.scope === "global";
  }
  if (filter === "mine") {
    return ownsPersonal(item, user);
  }
  return isVisibleInLibrary(item, user);
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
