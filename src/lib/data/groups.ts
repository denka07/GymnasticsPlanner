import "server-only";

import { asc, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { groups, seasons, sessions, users, type Group, type Season } from "@/db/schema";
import {
  canEdit,
  getAccessibleGroups,
  requireGroupAccess,
  requireGroupOwner,
  requireGroupScope,
  type AccessLevel,
  type GroupScope,
} from "@/lib/access";
import { canOpenSeason } from "@/lib/access/levels";
import { requireUser } from "@/lib/auth";

import { name } from "./schemas";

/** A session shared on its own, without access to its season. */
export type SharedSession = {
  id: string;
  date: string;
  startTime: string | null;
  seasonName: string;
};

export type GroupWithSeasons = {
  group: Group;
  /** Access to the whole group; null when only some seasons or sessions are shared. */
  access: AccessLevel | null;
  isMine: boolean;
  ownerName: string;
  /** The seasons the user can open, newest first. */
  seasons: Season[];
  /** Sessions shared on their own, by date. */
  sharedSessions: SharedSession[];
};

/** The parts of the groups the user can see: open seasons and sessions shared alone. */
async function fill(
  entries: { group: Group; scope: GroupScope; isMine: boolean; ownerName: string }[],
): Promise<GroupWithSeasons[]> {
  if (entries.length === 0) {
    return [];
  }
  const db = getDb();
  const sessionIds = entries.flatMap((e) => [...e.scope.sessions.keys()]);
  const [seasonRows, sessionRows] = await Promise.all([
    db
      .select()
      .from(seasons)
      .where(
        inArray(
          seasons.groupId,
          entries.map((e) => e.group.id),
        ),
      )
      .orderBy(desc(seasons.firstWeek), desc(seasons.createdAt)),
    sessionIds.length === 0
      ? []
      : db
          .select({
            id: sessions.id,
            date: sessions.date,
            startTime: sessions.startTime,
            seasonId: sessions.seasonId,
            seasonName: seasons.name,
          })
          .from(sessions)
          .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
          .where(inArray(sessions.id, sessionIds))
          .orderBy(asc(sessions.date), asc(sessions.startTime)),
  ]);

  return entries.map(({ group, scope, isMine, ownerName }) => ({
    group,
    access: scope.access,
    isMine,
    ownerName,
    seasons: seasonRows.filter((s) => s.groupId === group.id && canOpenSeason(scope, s.id)),
    sharedSessions: sessionRows
      .filter((s) => scope.sessions.has(s.id) && !canOpenSeason(scope, s.seasonId))
      .map(({ id, date, startTime, seasonName }) => ({ id, date, startTime, seasonName })),
  }));
}

/**
 * The groups the current user can see, oldest first: their own and those
 * shared with them, each with only what the user can open.
 */
export async function listMyGroups(): Promise<GroupWithSeasons[]> {
  const user = await requireUser();
  return fill(await getAccessibleGroups(user.id));
}

/**
 * One group with the seasons (and sessions shared alone) the user can open.
 * Calls notFound() when the user can see nothing in it.
 */
export async function getGroup(groupId: string): Promise<GroupWithSeasons> {
  const { user, scope } = await requireGroupScope(groupId);
  const [row] = await getDb()
    .select({ group: groups, ownerName: users.name })
    .from(groups)
    .innerJoin(users, eq(users.id, groups.ownerId))
    .where(eq(groups.id, groupId))
    .limit(1);
  const [result] = await fill([
    { group: row.group, scope, isMine: row.group.ownerId === user.id, ownerName: row.ownerName },
  ]);
  return result;
}

/** Creates a group owned by the current user and returns its id. */
export async function createGroup(input: { name: unknown }): Promise<string> {
  const user = await requireUser();
  const groupName = name.parse(input.name);
  const [row] = await getDb()
    .insert(groups)
    .values({ ownerId: user.id, name: groupName })
    .returning({ id: groups.id });
  return row.id;
}

/** Renames a group. Needs edit access to the whole group. */
export async function renameGroup(
  groupId: string,
  input: { name: unknown },
): Promise<void> {
  await requireGroupAccess(groupId, "edit");
  const groupName = name.parse(input.name);
  await getDb()
    .update(groups)
    .set({ name: groupName })
    .where(eq(groups.id, groupId));
}

/** Deletes the group and, by cascade, everything in it and its shares. Owner only. */
export async function deleteGroup(groupId: string): Promise<void> {
  await requireGroupOwner(groupId);
  await getDb().delete(groups).where(eq(groups.id, groupId));
}

/** The groups the current user may add seasons to (edit access to the whole group), oldest first. */
export async function listEditableGroups(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  const accessible = await getAccessibleGroups(user.id);
  return accessible
    .filter((a) => canEdit(a.scope.access))
    .map((a) => ({ id: a.group.id, name: a.group.name }));
}
