import "server-only";

import { and, asc, eq, inArray, or, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb } from "@/db";
import {
  exercises,
  groups,
  seasons,
  sessions,
  stations,
  type Exercise,
  type Group,
  type Station,
  type User,
} from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { libraryAccess } from "@/lib/library";

import {
  isUuid,
  meetsMinimum,
  type AccessLevel,
  type MinimumAccess,
} from "./levels";

export { canEdit, canView } from "./levels";
export type { AccessLevel, MinimumAccess } from "./levels";

/**
 * The user's access to a group, or null for none.
 *
 * Only the owner has access for now. Shares (docs/data-model.md, "Share") will
 * be consulted here later, so callers do not change.
 */
export async function getGroupAccess(
  userId: string,
  groupId: string,
): Promise<AccessLevel | null> {
  if (!isUuid(userId) || !isUuid(groupId)) {
    return null;
  }
  const [row] = await getDb()
    .select({ id: groups.id })
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.ownerId, userId)))
    .limit(1);
  if (row) {
    return "owner";
  }
  // TODO(shares): look up a share on this group for userId and return its level.
  return null;
}

/**
 * The user's access to a season, or null for none. A season has the access its
 * group gives.
 */
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
  if (row.ownerId === userId) {
    return "owner";
  }
  // TODO(shares): look up a share on this season, then on its group
  // (row.groupId), and return the highest level found.
  return null;
}

/**
 * The user's access to a session, or null for none. A session has the access
 * its season gives.
 */
export async function getSessionAccess(
  userId: string,
  sessionId: string,
): Promise<AccessLevel | null> {
  if (!isUuid(userId) || !isUuid(sessionId)) {
    return null;
  }
  const [row] = await getDb()
    .select({ seasonId: sessions.seasonId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!row) {
    return null;
  }
  // TODO(shares): also look up a share on this session for userId and return
  // the highest of that level and the season's.
  return getSeasonAccess(userId, row.seasonId);
}

type Granted = { user: User; access: AccessLevel };

/**
 * Signs the person in if needed, then returns their access to the group.
 * Calls notFound() when access is missing or too low, so the response does not
 * reveal whether the group exists.
 */
export async function requireGroupAccess(
  groupId: string,
  minimum: MinimumAccess,
): Promise<Granted> {
  const user = await requireUser();
  const access = await getGroupAccess(user.id, groupId);
  if (access === null || !meetsMinimum(access, minimum)) {
    notFound();
  }
  return { user, access };
}

/** Like requireGroupAccess, for a season. */
export async function requireSeasonAccess(
  seasonId: string,
  minimum: MinimumAccess,
): Promise<Granted> {
  const user = await requireUser();
  const access = await getSeasonAccess(user.id, seasonId);
  if (access === null || !meetsMinimum(access, minimum)) {
    notFound();
  }
  return { user, access };
}

/** Like requireGroupAccess, for a session. */
export async function requireSessionAccess(
  sessionId: string,
  minimum: MinimumAccess,
): Promise<Granted> {
  const user = await requireUser();
  const access = await getSessionAccess(user.id, sessionId);
  if (access === null || !meetsMinimum(access, minimum)) {
    notFound();
  }
  return { user, access };
}

/** Like requireGroupAccess, but only the owner passes (for deleting and sharing). */
export async function requireGroupOwner(groupId: string): Promise<Granted> {
  const granted = await requireGroupAccess(groupId, "edit");
  if (granted.access !== "owner") {
    notFound();
  }
  return granted;
}

/** Like requireSeasonAccess, but only the owner passes (for deleting and sharing). */
export async function requireSeasonOwner(seasonId: string): Promise<Granted> {
  const granted = await requireSeasonAccess(seasonId, "edit");
  if (granted.access !== "owner") {
    notFound();
  }
  return granted;
}

/**
 * The groups the user can see, with their access level, oldest first.
 * Only owned groups for now.
 */
export async function getAccessibleGroups(
  userId: string,
): Promise<{ group: Group; access: AccessLevel }[]> {
  if (!isUuid(userId)) {
    return [];
  }
  const owned = await getDb()
    .select()
    .from(groups)
    .where(eq(groups.ownerId, userId))
    .orderBy(asc(groups.createdAt));
  // TODO(shares): add groups shared with userId, and groups of seasons shared
  // with userId (with only those seasons visible).
  return owned.map((group) => ({ group, access: "owner" as const }));
}

// --- Library -------------------------------------------------------------------

type LibraryTable = typeof exercises | typeof stations;

/**
 * SQL condition for the library items in `table` that the user may see:
 * global ones and their own personal ones.
 */
export function visibleTo(table: LibraryTable, user: { id: string }): SQL {
  // TODO(shares): also personal items used in sessions shared with the user (step 5).
  return or(eq(table.scope, "global"), eq(table.ownerId, user.id))!;
}

/**
 * Signs the person in if needed and returns the exercise with their access.
 * Calls notFound() when access is missing or too low.
 */
export async function requireExerciseAccess(
  exerciseId: string,
  minimum: MinimumAccess,
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
  minimum: MinimumAccess,
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
