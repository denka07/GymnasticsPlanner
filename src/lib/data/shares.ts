import "server-only";

import { asc, eq, or, sql, type SQL } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ZodError } from "zod";

import { getDb } from "@/db";
import { seasons, sessions, shares, users, type ShareLevel, type User } from "@/db/schema";
import { requireGroupOwner, requireSeasonOwner, requireSessionOwner } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";

import {
  newShareInput,
  shareLevelInput,
  shareResourceInput,
  type ShareResource,
} from "./schemas";

function invalid(message = "invalid"): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

/** One person with access to a resource, as the Dela dialog lists them. */
export type ShareEntry = {
  id: string;
  email: string;
  /** Known once the person has signed in. */
  name: string | null;
  signedIn: boolean;
  level: ShareLevel;
  /** Set when the share is on a parent and so is managed there. */
  inheritedFrom: "group" | "season" | null;
};

/** The group, season and session ids above and including a resource. */
type Chain = { groupId: string; seasonId: string | null; sessionId: string | null };

/**
 * Checks that the current user owns the resource (only the owner shares) and
 * returns where it sits. Calls notFound() otherwise.
 */
async function requireOwnedChain(resource: ShareResource): Promise<{ chain: Chain; owner: User }> {
  const db = getDb();
  if (resource.kind === "group") {
    const { user } = await requireGroupOwner(resource.id);
    return { chain: { groupId: resource.id, seasonId: null, sessionId: null }, owner: user };
  }
  if (resource.kind === "season") {
    const { user } = await requireSeasonOwner(resource.id);
    const [row] = await db
      .select({ groupId: seasons.groupId })
      .from(seasons)
      .where(eq(seasons.id, resource.id))
      .limit(1);
    return { chain: { groupId: row.groupId, seasonId: resource.id, sessionId: null }, owner: user };
  }
  const { user } = await requireSessionOwner(resource.id);
  const [row] = await db
    .select({ seasonId: sessions.seasonId, groupId: seasons.groupId })
    .from(sessions)
    .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
    .where(eq(sessions.id, resource.id))
    .limit(1);
  return {
    chain: { groupId: row.groupId, seasonId: row.seasonId, sessionId: resource.id },
    owner: user,
  };
}

/** The column a share on this kind of resource points with. */
function columnOf(kind: ShareResource["kind"]) {
  return kind === "group" ? shares.groupId : kind === "season" ? shares.seasonId : shares.sessionId;
}

/**
 * Who has access to the resource: its own shares, then those inherited from
 * its season and group. Owner only.
 */
export async function listShares(input: unknown): Promise<ShareEntry[]> {
  const resource = shareResourceInput.parse(input);
  const { chain } = await requireOwnedChain(resource);
  const conditions: SQL[] = [eq(shares.groupId, chain.groupId)];
  if (chain.seasonId) {
    conditions.push(eq(shares.seasonId, chain.seasonId));
  }
  if (chain.sessionId) {
    conditions.push(eq(shares.sessionId, chain.sessionId));
  }
  const rows = await getDb()
    .select({ share: shares, name: users.name })
    .from(shares)
    .leftJoin(users, eq(users.id, shares.userId))
    .where(or(...conditions))
    .orderBy(asc(shares.createdAt), asc(shares.email));

  const kindOf = (r: (typeof rows)[number]["share"]) =>
    r.groupId ? "group" : r.seasonId ? "season" : "session";
  const order = { session: 0, season: 1, group: 2 } as const;
  return rows
    .map(({ share, name }) => {
      const kind = kindOf(share);
      return {
        id: share.id,
        email: share.email,
        name,
        signedIn: share.userId !== null,
        level: share.level,
        inheritedFrom: kind === resource.kind ? null : (kind as "group" | "season"),
      };
    })
    .sort((a, b) => order[a.inheritedFrom ?? resource.kind] - order[b.inheritedFrom ?? resource.kind]);
}

/**
 * Gives the person with this email access to the resource, or changes the
 * level of their existing share on it. Owner only. If the address already
 * belongs to a user the share works at once; otherwise it waits until they
 * first sign in with it.
 */
export async function addShare(resourceInput: unknown, input: unknown): Promise<void> {
  const resource = shareResourceInput.parse(resourceInput);
  const values = newShareInput.parse(input);
  const { owner } = await requireOwnedChain(resource);
  if (values.email === owner.email.toLowerCase()) {
    throw invalid("shareSelf");
  }
  const db = getDb();
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, values.email))
    .limit(1);
  const column = columnOf(resource.kind);
  await db
    .insert(shares)
    .values({
      email: values.email,
      userId: existingUser?.id ?? null,
      groupId: resource.kind === "group" ? resource.id : null,
      seasonId: resource.kind === "season" ? resource.id : null,
      sessionId: resource.kind === "session" ? resource.id : null,
      level: values.level,
      createdBy: owner.id,
    })
    .onConflictDoUpdate({
      target: [shares.email, column],
      set: { level: values.level },
    });
}

/** Loads a share and checks that the current user owns its resource. */
async function requireOwnedShare(shareId: unknown): Promise<string> {
  if (typeof shareId !== "string" || !isUuid(shareId)) {
    notFound();
  }
  const [row] = await getDb()
    .select({ groupId: shares.groupId, seasonId: shares.seasonId, sessionId: shares.sessionId })
    .from(shares)
    .where(eq(shares.id, shareId))
    .limit(1);
  if (!row) {
    notFound();
  }
  const resource: ShareResource = row.groupId
    ? { kind: "group", id: row.groupId }
    : row.seasonId
      ? { kind: "season", id: row.seasonId }
      : { kind: "session", id: row.sessionId! };
  await requireOwnedChain(resource);
  return shareId;
}

/** Switches a share between view and edit. Owner only. */
export async function updateShareLevel(shareId: unknown, level: unknown): Promise<void> {
  const value = shareLevelInput.parse(level);
  const id = await requireOwnedShare(shareId);
  await getDb().update(shares).set({ level: value }).where(eq(shares.id, id));
}

/** Removes a share. Owner only. */
export async function removeShare(shareId: unknown): Promise<void> {
  const id = await requireOwnedShare(shareId);
  await getDb().delete(shares).where(eq(shares.id, id));
}

