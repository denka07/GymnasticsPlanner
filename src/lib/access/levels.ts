/**
 * Pure access decisions. See "Users and sharing" in docs/data-model.md.
 *
 * - The owner of a group owns its seasons and sessions.
 * - A share gives "view" or "edit" on one group, season or session, and is
 *   inherited downwards: group → its seasons → their sessions.
 * - When several apply, the highest level wins.
 */

export type AccessLevel = "owner" | "edit" | "view";
export type ShareLevel = "edit" | "view";

/**
 * What an operation needs:
 *
 * - "view": read.
 * - "participate": the writes anyone who can view a session may make on the
 *   session page: ticking parts, resetting ticks and the note after the
 *   session. Every level passes; it is kept apart from "view" so that these
 *   writes are explicit and "edit" never has to be weakened for them.
 * - "edit": change content (plan grid, structure, sessions, outline, ...).
 * - "owner": share, delete and copy groups and seasons.
 */
export type MinimumAccess = "view" | "participate" | "edit" | "owner";

const RANK: Record<AccessLevel, number> = { view: 1, edit: 2, owner: 3 };
const REQUIRED: Record<MinimumAccess, number> = { view: 1, participate: 1, edit: 2, owner: 3 };

/** True when the level lets the user change content (owner or edit). */
export function canEdit(level: AccessLevel | null): boolean {
  return meetsMinimum(level, "edit");
}

/** True when the level lets the user read content (any level). */
export function canView(level: AccessLevel | null): boolean {
  return meetsMinimum(level, "view");
}

/** True when the level allows ticking parts and writing the note after a session. */
export function canParticipate(level: AccessLevel | null): boolean {
  return meetsMinimum(level, "participate");
}

/** True when the level is the owner's: sharing, deleting and copying. */
export function isOwner(level: AccessLevel | null): boolean {
  return meetsMinimum(level, "owner");
}

/** True when `level` is at least `minimum`. No access never satisfies it. */
export function meetsMinimum(level: AccessLevel | null, minimum: MinimumAccess): boolean {
  return level !== null && RANK[level] >= REQUIRED[minimum];
}

/** The highest of the given levels, or null when there are none. */
export function highest(levels: Iterable<AccessLevel | null | undefined>): AccessLevel | null {
  let best: AccessLevel | null = null;
  for (const level of levels) {
    if (level && (best === null || RANK[level] > RANK[best])) {
      best = level;
    }
  }
  return best;
}

/**
 * A share the user has received, with the group (and season) it lies in, so
 * that inheritance can be decided without more lookups. Exactly one of the
 * three kinds:
 *
 * - group share: `seasonId` and `sessionId` null;
 * - season share: `seasonId` set, `sessionId` null;
 * - session share: all three set.
 */
export type Grant = {
  level: ShareLevel;
  groupId: string;
  seasonId: string | null;
  sessionId: string | null;
};

/** Where a resource sits: a group, a season in a group, or a session in a season. */
export type Target =
  | { kind: "group"; groupId: string }
  | { kind: "season"; groupId: string; seasonId: string }
  | { kind: "session"; groupId: string; seasonId: string; sessionId: string };

/** True when the grant applies to the target, directly or inherited from a parent. */
export function grantCovers(grant: Grant, target: Target): boolean {
  if (grant.groupId !== target.groupId) {
    return false;
  }
  if (grant.seasonId === null) {
    // A group share covers the group and everything in it.
    return true;
  }
  if (target.kind === "group" || grant.seasonId !== target.seasonId) {
    return false;
  }
  if (grant.sessionId === null) {
    // A season share covers the season and its sessions.
    return true;
  }
  return target.kind === "session" && grant.sessionId === target.sessionId;
}

/**
 * The user's access to a target: "owner" for the group's owner, otherwise the
 * highest share that covers it, or null.
 */
export function resolveAccess(
  target: Target,
  owner: boolean,
  grants: readonly Grant[],
): AccessLevel | null {
  if (owner) {
    return "owner";
  }
  return highest(grants.filter((g) => grantCovers(g, target)).map((g) => g.level));
}

/**
 * What a user can see inside one group.
 *
 * - `access`: access to the whole group (owner or a group share), else null.
 * - `seasons`: seasons shared on their own, with their level.
 * - `sessions`: sessions shared on their own, with their level and season.
 *
 * A season is open to the user when `access` is set or it is in `seasons`; a
 * session when its season is open or it is in `sessions`.
 */
export type GroupScope = {
  access: AccessLevel | null;
  seasons: Map<string, ShareLevel>;
  sessions: Map<string, { level: ShareLevel; seasonId: string }>;
};

function raise<K>(map: Map<K, ShareLevel>, key: K, level: ShareLevel) {
  map.set(key, highest([map.get(key), level]) as ShareLevel);
}

/** The scope of every group the user can see something in, by group id. */
export function groupScopes(
  ownedGroupIds: readonly string[],
  grants: readonly Grant[],
): Map<string, GroupScope> {
  const scopes = new Map<string, GroupScope>();
  const scopeOf = (groupId: string) => {
    let scope = scopes.get(groupId);
    if (!scope) {
      scope = { access: null, seasons: new Map(), sessions: new Map() };
      scopes.set(groupId, scope);
    }
    return scope;
  };
  for (const id of ownedGroupIds) {
    scopeOf(id).access = "owner";
  }
  for (const g of grants) {
    const scope = scopeOf(g.groupId);
    if (g.seasonId === null) {
      scope.access = highest([scope.access, g.level]);
    } else if (g.sessionId === null) {
      raise(scope.seasons, g.seasonId, g.level);
    } else {
      const current = scope.sessions.get(g.sessionId);
      scope.sessions.set(g.sessionId, {
        level: highest([current?.level, g.level]) as ShareLevel,
        seasonId: g.seasonId,
      });
    }
  }
  return scopes;
}

/** The user's access to a season through a scope, or null. */
export function seasonAccessIn(scope: GroupScope, seasonId: string): AccessLevel | null {
  return highest([scope.access, scope.seasons.get(seasonId)]);
}

/** The user's access to a session through a scope, or null. */
export function sessionAccessIn(
  scope: GroupScope,
  seasonId: string,
  sessionId: string,
): AccessLevel | null {
  const own = scope.sessions.get(sessionId);
  return highest([seasonAccessIn(scope, seasonId), own?.seasonId === seasonId ? own.level : null]);
}

/** True when the user can open the season page through this scope. */
export function canOpenSeason(scope: GroupScope, seasonId: string): boolean {
  return seasonAccessIn(scope, seasonId) !== null;
}

/** True when the user can open the session page through this scope. */
export function canOpenSession(scope: GroupScope, seasonId: string, sessionId: string): boolean {
  return sessionAccessIn(scope, seasonId, sessionId) !== null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from URLs are untrusted; a malformed one must mean "no access". */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
