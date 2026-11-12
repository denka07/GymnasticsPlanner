import "server-only";

import { desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { groups, seasons, type Group, type Season } from "@/db/schema";
import {
  getAccessibleGroups,
  requireGroupAccess,
  requireGroupOwner,
  type AccessLevel,
} from "@/lib/access";
import { requireUser } from "@/lib/auth";

import { name } from "./schemas";

export type GroupWithSeasons = {
  group: Group;
  access: AccessLevel;
  /** Newest first. */
  seasons: Season[];
};

/** The current user's groups, oldest first, each with its seasons newest first. */
export async function listMyGroups(): Promise<GroupWithSeasons[]> {
  const user = await requireUser();
  const accessible = await getAccessibleGroups(user.id);
  if (accessible.length === 0) {
    return [];
  }
  const rows = await getDb()
    .select()
    .from(seasons)
    .where(
      inArray(
        seasons.groupId,
        accessible.map((a) => a.group.id),
      ),
    )
    .orderBy(desc(seasons.firstWeek), desc(seasons.createdAt));

  return accessible.map(({ group, access }) => ({
    group,
    access,
    seasons: rows.filter((s) => s.groupId === group.id),
  }));
}

/** One group with its seasons newest first. Calls notFound() without view access. */
export async function getGroup(groupId: string): Promise<GroupWithSeasons> {
  const { access } = await requireGroupAccess(groupId, "view");
  const db = getDb();
  const [[group], groupSeasons] = await Promise.all([
    db.select().from(groups).where(eq(groups.id, groupId)).limit(1),
    db
      .select()
      .from(seasons)
      .where(eq(seasons.groupId, groupId))
      .orderBy(desc(seasons.firstWeek), desc(seasons.createdAt)),
  ]);
  return { group, access, seasons: groupSeasons };
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

/** Deletes the group and, by cascade, everything in it. Owner only. */
export async function deleteGroup(groupId: string): Promise<void> {
  await requireGroupOwner(groupId);
  await getDb().delete(groups).where(eq(groups.id, groupId));
}
