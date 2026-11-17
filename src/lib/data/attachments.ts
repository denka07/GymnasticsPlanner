import "server-only";

import { and, eq } from "drizzle-orm";
import { z, ZodError } from "zod";

import { getDb } from "@/db";
import { attachments, type Attachment } from "@/db/schema";
import { getSessionAccess, requireSessionAccess } from "@/lib/access";
import { canEdit, canView, isUuid } from "@/lib/access/levels";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_TYPES,
  SNIFF_BYTES,
  attachmentPath,
  blobEnvironment,
  checkAttachment,
  displayFileName,
  isSessionPath,
  sniffType,
} from "@/lib/attachments";
import { getCurrentUser } from "@/lib/auth";
import { blobConfigured, deleteBlobs, readBlobStart } from "@/lib/blob";

import { ITEM, releaseBlobs, type AttachmentItem } from "./attachment-files";
import { resolveForEdit } from "./sessions";

/*
 * Files attached to a session (docs/data-model.md, "Attachment"). Anyone who
 * can view the session can open them; uploading and deleting need edit
 * access. Uploading goes in three steps, because a file of up to 10 MB is
 * larger than a server action or function request body may be on Vercel:
 *
 * 1. prepareAttachmentUpload (server action) checks edit access, stores a
 *    placeholder session if needed and picks the file's path.
 * 2. The browser uploads the file straight to the private Blob store with a
 *    short-lived client token from POST /api/attachments/upload, which checks
 *    edit access again and only allows that session's folder, the accepted
 *    types and 10 MB (authorizeAttachmentUpload).
 * 3. registerAttachment (server action) reads the stored file's size and
 *    first bytes, deletes it if it is not an accepted photo or PDF, and
 *    otherwise adds the attachment row.
 */

function invalid(message = "invalid"): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

const fileInput = z
  .object({
    name: z.string({ error: "invalid" }).max(1000, { error: "invalid" }),
    type: z.string({ error: "invalid" }).max(200, { error: "invalid" }),
    size: z.number({ error: "invalid" }).int({ error: "invalid" }),
  })
  .strict();

function requireStore() {
  if (!blobConfigured()) {
    throw invalid("attachmentsUnavailable");
  }
}

/**
 * Step 1: checks the file's declared type and size and edit access to the
 * target (a stored session or a slot's placeholder, which is stored now, as
 * on any first edit). Returns the session id and the path to upload to.
 */
export async function prepareAttachmentUpload(
  target: unknown,
  input: unknown,
): Promise<{ sessionId: string; pathname: string }> {
  requireStore();
  const file = fileInput.parse(input);
  const problem = checkAttachment(file);
  if (problem) {
    throw invalid(problem === "tooLarge" ? "attachmentTooLarge" : "attachmentWrongType");
  }
  const { sessionId } = await resolveForEdit(target);
  const random = crypto.randomUUID().replaceAll("-", "");
  const pathname = attachmentPath(blobEnvironment(process.env), sessionId, random, file.name);
  return { sessionId, pathname };
}

const uploadPayload = z.object({ sessionId: z.string() }).strict();

/**
 * Step 2, for handleUpload's onBeforeGenerateToken: the options of a client
 * token for uploading `pathname`, or null when the signed-in user may not
 * (not signed in, no edit access, or a path outside the session's folder).
 */
export async function authorizeAttachmentUpload(pathname: string, clientPayload: string | null) {
  if (!blobConfigured()) {
    return null;
  }
  let sessionId: string;
  try {
    ({ sessionId } = uploadPayload.parse(JSON.parse(clientPayload ?? "")));
  } catch {
    return null;
  }
  const user = await getCurrentUser();
  if (!user || !isUuid(sessionId)) {
    return null;
  }
  const access = await getSessionAccess(user.id, sessionId);
  if (access === null || !canEdit(access)) {
    return null;
  }
  if (!isSessionPath(pathname, blobEnvironment(process.env), sessionId)) {
    return null;
  }
  return {
    allowedContentTypes: [...ATTACHMENT_TYPES],
    maximumSizeInBytes: ATTACHMENT_MAX_BYTES,
    addRandomSuffix: false,
    allowOverwrite: false,
    validUntil: Date.now() + 10 * 60 * 1000,
  };
}

const registerInput = z
  .object({
    pathname: z.string({ error: "invalid" }).max(400, { error: "invalid" }),
    fileName: z.string({ error: "invalid" }).max(1000, { error: "invalid" }),
  })
  .strict();

/**
 * Step 3: adds the uploaded file to the session after checking what was
 * actually stored. A file that is not an accepted photo or PDF by its first
 * bytes, or is too large, is deleted from the store and refused.
 */
export async function registerAttachment(sessionId: string, input: unknown): Promise<AttachmentItem> {
  requireStore();
  const { pathname, fileName } = registerInput.parse(input);
  if (!isUuid(sessionId)) {
    throw invalid();
  }
  const { user } = await requireSessionAccess(sessionId, "edit");
  if (!isSessionPath(pathname, blobEnvironment(process.env), sessionId)) {
    throw invalid();
  }
  const stored = await readBlobStart(pathname, SNIFF_BYTES);
  if (!stored) {
    throw invalid("attachmentNotUploaded");
  }
  const contentType = sniffType(stored.bytes);
  const problem = !contentType
    ? "attachmentWrongType"
    : stored.size > ATTACHMENT_MAX_BYTES
      ? "attachmentTooLarge"
      : stored.size <= 0
        ? "attachmentWrongType"
        : null;
  if (problem || !contentType) {
    await deleteBlobs([pathname]);
    throw invalid(problem ?? "attachmentWrongType");
  }
  const [row] = await getDb()
    .insert(attachments)
    .values({
      sessionId,
      pathname,
      fileName: displayFileName(fileName),
      contentType,
      sizeBytes: stored.size,
      uploadedBy: user.id,
    })
    .onConflictDoNothing({ target: [attachments.sessionId, attachments.pathname] })
    .returning(ITEM);
  if (!row) {
    // Registered already (a repeated request).
    const [existing] = await getDb()
      .select(ITEM)
      .from(attachments)
      .where(and(eq(attachments.sessionId, sessionId), eq(attachments.pathname, pathname)))
      .limit(1);
    return existing;
  }
  return row;
}

/** Removes an attachment; the stored file goes too unless a copy still refers to it. */
export async function deleteAttachment(attachmentId: string): Promise<string> {
  if (!isUuid(attachmentId)) {
    throw invalid();
  }
  const db = getDb();
  const [row] = await db
    .select({ sessionId: attachments.sessionId, pathname: attachments.pathname })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) {
    // Gone already, or never there; do not reveal which.
    throw invalid();
  }
  await requireSessionAccess(row.sessionId, "edit");
  await db.delete(attachments).where(eq(attachments.id, attachmentId));
  await releaseBlobs([row.pathname]);
  return row.sessionId;
}

/**
 * The attachment to send to the signed-in user, or null when it does not
 * exist or they cannot view its session (the route answers 404 either way).
 */
export async function getAttachmentForDownload(
  attachmentId: string,
): Promise<Pick<Attachment, "pathname" | "fileName" | "contentType" | "sizeBytes"> | null> {
  if (!isUuid(attachmentId)) {
    return null;
  }
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }
  const [row] = await getDb()
    .select({
      sessionId: attachments.sessionId,
      pathname: attachments.pathname,
      fileName: attachments.fileName,
      contentType: attachments.contentType,
      sizeBytes: attachments.sizeBytes,
    })
    .from(attachments)
    .where(eq(attachments.id, attachmentId))
    .limit(1);
  if (!row) {
    return null;
  }
  const access = await getSessionAccess(user.id, row.sessionId);
  if (access === null || !canView(access)) {
    return null;
  }
  return row;
}
