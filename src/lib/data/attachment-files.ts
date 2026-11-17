import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { attachments, seasons, sessions, type Attachment } from "@/db/schema";
import { unreferenced } from "@/lib/attachments";
import { deleteBlobs } from "@/lib/blob";

/*
 * Keeping the Blob store in step with the attachments table. Several rows may
 * share one stored file (copying a session copies its rows), so a file is
 * deleted only when no row refers to it any more. Callers have checked access.
 */

/** What the lists show of an attachment. */
export type AttachmentItem = Pick<Attachment, "id" | "fileName" | "contentType" | "sizeBytes">;

export const ITEM = {
  id: attachments.id,
  fileName: attachments.fileName,
  contentType: attachments.contentType,
  sizeBytes: attachments.sizeBytes,
};

/** The attachments of the given sessions, oldest first. Callers have checked view access. */
export async function loadAttachments(sessionIds: string[]): Promise<Map<string, AttachmentItem[]>> {
  const result = new Map<string, AttachmentItem[]>(sessionIds.map((id) => [id, []]));
  if (sessionIds.length === 0) {
    return result;
  }
  const rows = await getDb()
    .select({ ...ITEM, sessionId: attachments.sessionId })
    .from(attachments)
    .where(inArray(attachments.sessionId, sessionIds))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
  for (const { sessionId, ...item } of rows) {
    result.get(sessionId)?.push(item);
  }
  return result;
}

/** The stored files the attachments of a session, season or group refer to. */
export async function pathnamesOfSession(sessionId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ pathname: attachments.pathname })
    .from(attachments)
    .where(eq(attachments.sessionId, sessionId));
  return rows.map((r) => r.pathname);
}

export async function pathnamesOfSeason(seasonId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ pathname: attachments.pathname })
    .from(attachments)
    .innerJoin(sessions, eq(sessions.id, attachments.sessionId))
    .where(eq(sessions.seasonId, seasonId));
  return rows.map((r) => r.pathname);
}

export async function pathnamesOfGroup(groupId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ pathname: attachments.pathname })
    .from(attachments)
    .innerJoin(sessions, eq(sessions.id, attachments.sessionId))
    .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
    .where(eq(seasons.groupId, groupId));
  return rows.map((r) => r.pathname);
}

/**
 * Call after a database delete with the stored files the deleted rows
 * referred to: deletes those that no remaining row refers to. Best effort;
 * failures are logged and never undo or fail the delete.
 */
export async function releaseBlobs(pathnames: string[]): Promise<void> {
  if (pathnames.length === 0) {
    return;
  }
  try {
    const unique = [...new Set(pathnames)];
    const still = await getDb()
      .select({ pathname: attachments.pathname })
      .from(attachments)
      .where(inArray(attachments.pathname, unique));
    await deleteBlobs(unreferenced(unique, still.map((r) => r.pathname)));
  } catch (error) {
    console.error(
      "Could not clean up stored attachment files:",
      error instanceof Error ? error.message : error,
    );
  }
}

/**
 * The statement that gives `targetId` a copy of every attachment of
 * `sourceId`, pointing at the same stored files (nothing is uploaded again).
 * Files the target already has are skipped. Empty when the source has none.
 * (A list, because an async function would run a returned query itself.)
 */
export async function copyAttachmentsStatements(sourceId: string, targetId: string, userId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.sessionId, sourceId))
    .orderBy(asc(attachments.createdAt), asc(attachments.id));
  if (rows.length === 0) {
    return [];
  }
  const start = Date.now();
  const statement = db
    .insert(attachments)
    .values(
      rows.map((r, i) => ({
        sessionId: targetId,
        pathname: r.pathname,
        fileName: r.fileName,
        contentType: r.contentType,
        sizeBytes: r.sizeBytes,
        uploadedBy: userId,
        // Keeps the source's order after the target's own files.
        createdAt: new Date(start + i),
      })),
    )
    .onConflictDoNothing({ target: [attachments.sessionId, attachments.pathname] });
  return [statement];
}
