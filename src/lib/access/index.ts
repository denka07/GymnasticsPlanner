import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb } from "@/db";
import { groups, seasons, type Group, type User } from "@/db/schema";
import { requireUser } from "@/lib/auth";

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
