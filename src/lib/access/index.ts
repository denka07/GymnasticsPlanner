import "server-only";

import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getDb } from "@/db";
import {
  exercises,
  groups,
  seasons,
  sessions,
  shares,
  stations,
  users,
  type Exercise,
  type Group,
  type Station,
  type User,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { libraryAccess } from "@/lib/library";

import {
  groupScopes,
  isUuid,
  meetsMinimum,
  resolveAccess,
  type AccessLevel,
  type Grant,
  type GroupScope,
  type MinimumAccess,
} from "./levels";

export { canEdit, canParticipate, canView, isOwner } from "./levels";
export type { AccessLevel, GroupScope, MinimumAccess } from "./levels";

/*
 * Access to groups, seasons and sessions comes from ownership and shares
 * (docs/data-model.md, "Users and sharing"). The decisions are pure functions
 * in ./levels.ts; this module only loads what they need.
 */

/**
 * The shares the user has received, each with the group (and season) it lies
 * in. Cached for the duration of a request.
 */
const loadGrants = cache(async (userId: string): Promise<Grant[]> => {
  if (!isUuid(userId)) {
    return [];
  }
  const shareSeason = alias(seasons, "share_season");
  const shareSession = alias(sessions, "share_session");
  const sessionSeason = alias(seasons, "session_season");
  const rows = await getDb()
    .select({
      level: shares.level,
      groupId: shares.groupId,
      seasonId: shares.seasonId,
      sessionId: shares.sessionId,
      seasonGroupId: shareSeason.groupId,
      sessionSeasonId: shareSession.seasonId,
      sessionGroupId: sessionSeason.groupId,
    })
    .from(shares)
    .leftJoin(shareSeason, eq(shareSeason.id, shares.seasonId))
    .leftJoin(shareSession, eq(shareSession.id, shares.sessionId))
    .leftJoin(sessionSeason, eq(sessionSeason.id, shareSession.seasonId))
    .where(eq(shares.userId, userId));
  const grants: Grant[] = [];
  for (const r of rows) {
    if (r.groupId) {
      grants.push({ level: r.level, groupId: r.groupId, seasonId: null, sessionId: null });
    } else if (r.seasonId && r.seasonGroupId) {
      grants.push({ level: r.level, groupId: r.seasonGroupId, seasonId: r.seasonId, sessionId: null });
    } else if (r.sessionId && r.sessionSeasonId && r.sessionGroupId) {
      grants.push({
        level: r.level,
        groupId: r.sessionGroupId,
        seasonId: r.sessionSeasonId,
        sessionId: r.sessionId,
      });
    }
  }
  return grants;
});

/** The user's access to the whole group (owner or a group share), or null. */
export async function getGroupAccess(
  userId: string,
  groupId: string,
): Promise<AccessLevel | null> {
  if (!isUuid(userId) || !isUuid(groupId)) {
    return null;
  }
  const [row] = await getDb()
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!row) {
    return null;
  }
  return resolveAccess({ kind: "group", groupId }, row.ownerId === userId, await loadGrants(userId));
}

/**
 * What the user can see inside a group: the whole group, or only some seasons
 * or sessions. Null when they can see nothing in it.
 */
export async function getGroupScope(userId: string, groupId: string): Promise<GroupScope | null> {
  if (!isUuid(userId) || !isUuid(groupId)) {
    return null;
  }
  const [row] = await getDb()
    .select({ ownerId: groups.ownerId })
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!row) {
    return null;
  }
  const scopes = groupScopes(row.ownerId === userId ? [groupId] : [], await loadGrants(userId));
  return scopes.get(groupId) ?? null;
}

/** The user's access to a season (owner, its group's share or its own), or null. */
export async function getSeasonAccess(
  userId: string,
  seasonId: string,
): Promise<AccessLevel | null> {
  if (!isUuid(userId) || !isUuid(seasonId)) {
    return null;
  }
  const [row] = await getDb()
    .select({ groupId: seasons.groupId, ownerId: groups.ownerId })
    .from(seasons)
    .innerJoin(groups, eq(groups.id, seasons.groupId))
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!row) {
    return null;
  }
  return resolveAccess(
    { kind: "season", groupId: row.groupId, seasonId },
    row.ownerId === userId,
    await loadGrants(userId),
  );
}

/** The user's access to a session (owner, or a share on it, its season or group), or null. */
export async function getSessionAccess(
  userId: string,
  sessionId: string,
): Promise<AccessLevel | null> {
  if (!isUuid(userId) || !isUuid(sessionId)) {
    return null;
  }
  const [row] = await getDb()
    .select({ seasonId: sessions.seasonId, groupId: seasons.groupId, ownerId: groups.ownerId })
    .from(sessions)
    .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
    .innerJoin(groups, eq(groups.id, seasons.groupId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) {
    return null;
  }
  return resolveAccess(
    { kind: "session", groupId: row.groupId, seasonId: row.seasonId, sessionId },
    row.ownerId === userId,
    await loadGrants(userId),
  );
}

type Granted = { user: User; access: AccessLevel };

function check(access: AccessLevel | null, minimum: MinimumAccess): AccessLevel {
  if (access === null || !meetsMinimum(access, minimum)) {
    // The response does not reveal whether the resource exists.
    notFound();
  }
  return access;
}

/**
 * Signs the person in if needed, then returns their access to the whole group.
 * Calls notFound() when access is missing or below `minimum`.
 */
export async function requireGroupAccess(
  groupId: string,
  minimum: MinimumAccess,
): Promise<Granted> {
  const user = await requireUser();
  return { user, access: check(await getGroupAccess(user.id, groupId), minimum) };
}

/** Like requireGroupAccess, for a season. */
export async function requireSeasonAccess(
  seasonId: string,
  minimum: MinimumAccess,
): Promise<Granted> {
  const user = await requireUser();
  return { user, access: check(await getSeasonAccess(user.id, seasonId), minimum) };
}

/** Like requireGroupAccess, for a session. */
export async function requireSessionAccess(
  sessionId: string,
  minimum: MinimumAccess,
): Promise<Granted> {
  const user = await requireUser();
  return { user, access: check(await getSessionAccess(user.id, sessionId), minimum) };
}

/**
 * Signs the person in if needed and returns what they can see in the group,
 * even if that is a single season or session. Calls notFound() when nothing.
 */
export async function requireGroupScope(groupId: string): Promise<{ user: User; scope: GroupScope }> {
  const user = await requireUser();
  const scope = await getGroupScope(user.id, groupId);
  if (!scope) {
    notFound();
  }
  return { user, scope };
}

/** Only the owner passes (for sharing, deleting and copying). */
export function requireGroupOwner(groupId: string): Promise<Granted> {
  return requireGroupAccess(groupId, "owner");
}

/** Only the owner passes (for sharing, deleting and copying). */
export function requireSeasonOwner(seasonId: string): Promise<Granted> {
  return requireSeasonAccess(seasonId, "owner");
}

/** Only the owner passes (for sharing). */
export function requireSessionOwner(sessionId: string): Promise<Granted> {
  return requireSessionAccess(sessionId, "owner");
}

export type AccessibleGroup = {
  group: Group;
  scope: GroupScope;
  /** The owner's name, for groups shared with the user. */
  ownerName: string;
  isMine: boolean;
};

/**
 * The groups the user can see something in, oldest first: their own and
 * those shared with them in whole or in part.
 */
export async function getAccessibleGroups(userId: string): Promise<AccessibleGroup[]> {
  if (!isUuid(userId)) {
    return [];
  }
  const grants = await loadGrants(userId);
  const sharedIds = [...new Set(grants.map((g) => g.groupId))];
  const rows = await getDb()
    .select({ group: groups, ownerName: users.name })
    .from(groups)
    .innerJoin(users, eq(users.id, groups.ownerId))
    .where(
      sharedIds.length > 0
        ? or(eq(groups.ownerId, userId), inArray(groups.id, sharedIds))
        : eq(groups.ownerId, userId),
    )
    .orderBy(asc(groups.createdAt));
  const owned = rows.filter((r) => r.group.ownerId === userId).map((r) => r.group.id);
  const scopes = groupScopes(owned, grants);
  return rows.flatMap(({ group, ownerName }) => {
    const scope = scopes.get(group.id);
    return scope ? [{ group, scope, ownerName, isMine: group.ownerId === userId }] : [];
  });
}

// --- Library -------------------------------------------------------------------

type LibraryTable = typeof exercises | typeof stations;

/**
 * SQL condition for the library items in `table` that the user may find in
 * the library and link: global ones and their own personal ones.
 *
 * Personal items of others that a shared session uses are not listed here:
 * they are shown with the session (src/lib/data/session-view.ts) but cannot
 * be browsed or newly linked, and existing links to them survive an edit.
 */
export function visibleTo(table: LibraryTable, user: { id: string }): SQL {
  return or(eq(table.scope, "global"), eq(table.ownerId, user.id))!;
}

/**
 * Signs the person in if needed and returns the exercise with their access.
 * Calls notFound() when access is missing or too low.
 */
export async function requireExerciseAccess(
  exerciseId: string,
  minimum: "view" | "edit",
): Promise<{ user: User; exercise: Exercise; access: "edit" | "view" }> {
  const user = await requireUser();
  if (!isUuid(exerciseId)) {
    notFound();
  }
  const [exercise] = await getDb()
    .select()
    .from(exercises)
    .where(eq(exercises.id, exerciseId))
    .limit(1);
  const access = exercise ? libraryAccess(exercise, user) : null;
  if (access === null || (minimum === "edit" && access !== "edit")) {
    notFound();
  }
  return { user, exercise, access };
}

/** Like requireExerciseAccess, for a station. */
export async function requireStationAccess(
  stationId: string,
  minimum: "view" | "edit",
): Promise<{ user: User; station: Station; access: "edit" | "view" }> {
  const user = await requireUser();
  if (!isUuid(stationId)) {
    notFound();
  }
  const [station] = await getDb()
    .select()
    .from(stations)
    .where(eq(stations.id, stationId))
    .limit(1);
  const access = station ? libraryAccess(station, user) : null;
  if (access === null || (minimum === "edit" && access !== "edit")) {
    notFound();
  }
  return { user, station, access };
}

/**
 * True when every id is an item in `table` the user may see. Used before
 * linking stations and exercises, so nobody links what they cannot see.
 */
export async function allVisible(
  table: LibraryTable,
  user: { id: string },
  ids: readonly string[],
): Promise<boolean> {
  if (ids.length === 0) {
    return true;
  }
  const rows = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(and(inArray(table.id, [...ids]), visibleTo(table, user)));
  return rows.length === ids.length;
}

/** Signs the person in if needed; only administrators pass, others get notFound(). */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) {
    notFound();
  }
  return user;
}
