import "server-only";

import { and, asc, count, desc, eq, exists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import { exercises, stations, submissions, users, type SubmissionStatus } from "@/db/schema";
import { requireAdmin, requireExerciseAccess, requireStationAccess } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import {
  canCopy,
  canMakeGlobal,
  canReview,
  canSubmit,
  canWithdraw,
  pgErrorCode,
  PG_UNIQUE_VIOLATION,
  submissionStatusFor,
  type LibraryItemRef,
  type LibraryUser,
} from "@/lib/library";

import { UserError } from "./errors";
import { id as idSchema, reviewCommentInput } from "./schemas";

/*
 * Submitting personal exercises and stations for review, and the
 * administrators' approval and rejection (docs/data-model.md, "Submission").
 * The rules are pure functions in src/lib/library.ts.
 */

export type LibraryKind = "station" | "exercise";

function itemTable(kind: LibraryKind) {
  return kind === "station" ? stations : exercises;
}

function itemColumn(kind: LibraryKind) {
  return kind === "station" ? submissions.stationId : submissions.exerciseId;
}

async function requireItem(kind: LibraryKind, itemId: string, minimum: "view" | "edit") {
  if (kind === "station") {
    const { user, station, access } = await requireStationAccess(itemId, minimum);
    return { user, item: station, access };
  }
  const { user, exercise, access } = await requireExerciseAccess(itemId, minimum);
  return { user, item: exercise, access };
}

export type ReviewState = {
  /**
   * The newest submission the user made for this item, with the review
   * comment, so the submitter sees pending, approved or rejected.
   */
  mine: {
    status: SubmissionStatus;
    submittedAt: Date;
    reviewedAt: Date | null;
    reviewComment: string | null;
  } | null;
  /** For administrators: the pending submission and who made it. */
  pending: { id: string; submittedAt: Date; submitterName: string } | null;
  canSubmit: boolean;
  canWithdraw: boolean;
  canReview: boolean;
  canMakeGlobal: boolean;
  canCopy: boolean;
};

/** What the user sees and may do about review on an item they can open. */
export async function getReviewState(
  kind: LibraryKind,
  item: LibraryItemRef & { id: string },
  user: LibraryUser,
): Promise<ReviewState> {
  const rows = await getDb()
    .select({
      id: submissions.id,
      status: submissions.status,
      submittedBy: submissions.submittedBy,
      submittedAt: submissions.submittedAt,
      reviewedAt: submissions.reviewedAt,
      reviewComment: submissions.reviewComment,
      submitterName: users.name,
    })
    .from(submissions)
    .innerJoin(users, eq(users.id, submissions.submittedBy))
    .where(eq(itemColumn(kind), item.id));
  const pendingRow = rows.find((r) => r.status === "pending") ?? null;
  const mine = submissionStatusFor(rows, user);
  return {
    mine: mine && {
      status: mine.status,
      submittedAt: mine.submittedAt,
      reviewedAt: mine.reviewedAt,
      reviewComment: mine.reviewComment,
    },
    pending:
      pendingRow && user.isAdmin
        ? { id: pendingRow.id, submittedAt: pendingRow.submittedAt, submitterName: pendingRow.submitterName }
        : null,
    canSubmit: canSubmit(item, user, pendingRow !== null),
    canWithdraw: pendingRow !== null && canWithdraw(pendingRow, user),
    canReview: pendingRow !== null && canReview(pendingRow, item, user),
    canMakeGlobal: canMakeGlobal(item, user),
    canCopy: canCopy(item),
  };
}

/** Submits the user's personal item for review. */
export async function submitForReview(kind: LibraryKind, itemId: string): Promise<void> {
  const { user, item } = await requireItem(kind, itemId, "edit");
  const db = getDb();
  const [pending] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(itemColumn(kind), item.id), eq(submissions.status, "pending")))
    .limit(1);
  if (!canSubmit(item, user, pending !== undefined)) {
    throw new UserError(pending ? "alreadySubmitted" : "invalid");
  }
  try {
    await db.insert(submissions).values({
      ...(kind === "station" ? { stationId: item.id } : { exerciseId: item.id }),
      submittedBy: user.id,
    });
  } catch (error) {
    // The database allows one pending submission per item.
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      throw new UserError("alreadySubmitted");
    }
    throw error;
  }
}

/** Withdraws the user's pending submission of an item; it is deleted. */
export async function withdrawSubmission(kind: LibraryKind, itemId: string): Promise<void> {
  const { user, item } = await requireItem(kind, itemId, "edit");
  const db = getDb();
  const [pending] = await db
    .select({ id: submissions.id, status: submissions.status, submittedBy: submissions.submittedBy })
    .from(submissions)
    .where(and(eq(itemColumn(kind), item.id), eq(submissions.status, "pending")))
    .limit(1);
  if (!pending || !canWithdraw(pending, user)) {
    throw new UserError("submissionNotPending");
  }
  await db
    .delete(submissions)
    .where(
      and(
        eq(submissions.id, pending.id),
        eq(submissions.status, "pending"),
        eq(submissions.submittedBy, user.id),
      ),
    );
}

/** Loads a submission with its item, for reviewing. Only administrators pass. */
async function requireReviewable(submissionId: string) {
  const user = await requireAdmin();
  const subId = idSchema.parse(submissionId);
  const db = getDb();
  const [row] = await db
    .select({
      id: submissions.id,
      status: submissions.status,
      exerciseId: submissions.exerciseId,
      stationId: submissions.stationId,
    })
    .from(submissions)
    .where(eq(submissions.id, subId))
    .limit(1);
  if (!row) {
    throw new UserError("submissionNotPending");
  }
  const kind: LibraryKind = row.stationId ? "station" : "exercise";
  const table = itemTable(kind);
  const itemId = (row.stationId ?? row.exerciseId)!;
  const [item] = await db
    .select({ id: table.id, scope: table.scope, ownerId: table.ownerId })
    .from(table)
    .where(eq(table.id, itemId))
    .limit(1);
  if (!item || !canReview(row, item, user)) {
    throw new UserError("submissionNotPending");
  }
  return { user, submission: row, kind, item };
}

/**
 * Approves a pending submission: in one transaction the submission is marked
 * approved and the item itself becomes global (its owner is cleared, its
 * creator kept). Sessions that use it keep working. Administrators only.
 */
export async function approveSubmission(submissionId: string): Promise<{ kind: LibraryKind; itemId: string }> {
  const { user, submission, kind, item } = await requireReviewable(submissionId);
  const db = getDb();
  const table = itemTable(kind);
  await db.batch([
    db
      .update(submissions)
      .set({ status: "approved", reviewedBy: user.id, reviewedAt: new Date(), reviewComment: null })
      .where(and(eq(submissions.id, submission.id), eq(submissions.status, "pending"))),
    // Runs only when the update above approved the submission, so a
    // submission that was withdrawn or reviewed meanwhile changes nothing.
    db
      .update(table)
      .set({ scope: "global", ownerId: null })
      .where(
        and(
          eq(table.id, item.id),
          eq(table.scope, "personal"),
          exists(
            db
              .select({ one: sql`1` })
              .from(submissions)
              .where(
                and(
                  eq(submissions.id, submission.id),
                  eq(submissions.status, "approved"),
                  eq(submissions.reviewedBy, user.id),
                ),
              ),
          ),
        ),
      ),
  ]);
  return { kind, itemId: item.id };
}

/**
 * Rejects a pending submission with a comment the submitter sees. The item
 * stays personal. Administrators only.
 */
export async function rejectSubmission(
  submissionId: string,
  comment: unknown,
): Promise<{ kind: LibraryKind; itemId: string }> {
  const { user, submission, kind, item } = await requireReviewable(submissionId);
  const text = reviewCommentInput.parse(comment);
  const updated = await getDb()
    .update(submissions)
    .set({ status: "rejected", reviewedBy: user.id, reviewedAt: new Date(), reviewComment: text })
    .where(and(eq(submissions.id, submission.id), eq(submissions.status, "pending")))
    .returning({ id: submissions.id });
  if (updated.length === 0) {
    throw new UserError("submissionNotPending");
  }
  return { kind, itemId: item.id };
}

/**
 * Turns an administrator's own personal item global without review. A
 * pending submission of it, if any, is marked approved in the same
 * transaction.
 */
export async function makeGlobal(kind: LibraryKind, itemId: string): Promise<void> {
  const { user, item } = await requireItem(kind, itemId, "edit");
  if (!canMakeGlobal(item, user)) {
    throw new UserError("invalid");
  }
  const db = getDb();
  const table = itemTable(kind);
  await db.batch([
    db
      .update(submissions)
      .set({ status: "approved", reviewedBy: user.id, reviewedAt: new Date() })
      .where(and(eq(itemColumn(kind), item.id), eq(submissions.status, "pending"))),
    db
      .update(table)
      .set({ scope: "global", ownerId: null })
      .where(and(eq(table.id, item.id), eq(table.ownerId, user.id), eq(table.scope, "personal"))),
  ]);
}

export type PendingSubmission = {
  id: string;
  kind: LibraryKind;
  itemId: string;
  itemName: string;
  submitterName: string;
  submittedAt: Date;
};

/** The pending submissions, oldest first. Administrators only. */
export async function listPendingSubmissions(): Promise<PendingSubmission[]> {
  await requireAdmin();
  const submitter = alias(users, "submitter");
  const rows = await getDb()
    .select({
      id: submissions.id,
      stationId: stations.id,
      stationName: stations.name,
      exerciseId: exercises.id,
      exerciseName: exercises.name,
      submitterName: submitter.name,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(submitter, eq(submitter.id, submissions.submittedBy))
    .leftJoin(stations, eq(stations.id, submissions.stationId))
    .leftJoin(exercises, eq(exercises.id, submissions.exerciseId))
    .where(eq(submissions.status, "pending"))
    .orderBy(asc(submissions.submittedAt));
  return rows.flatMap((r): PendingSubmission[] => {
    if (r.stationId && r.stationName !== null) {
      return [{ id: r.id, kind: "station" as const, itemId: r.stationId, itemName: r.stationName, submitterName: r.submitterName, submittedAt: r.submittedAt }];
    }
    if (r.exerciseId && r.exerciseName !== null) {
      return [{ id: r.id, kind: "exercise" as const, itemId: r.exerciseId, itemName: r.exerciseName, submitterName: r.submitterName, submittedAt: r.submittedAt }];
    }
    return [];
  });
}

/** How many submissions await review; 0 for non-administrators. */
export async function countPendingSubmissions(user: LibraryUser): Promise<number> {
  if (!user.isAdmin) {
    return 0;
  }
  const [row] = await getDb()
    .select({ n: count() })
    .from(submissions)
    .where(eq(submissions.status, "pending"));
  return row?.n ?? 0;
}

/**
 * The status of the user's newest submission for each of the given items,
 * for marking items in lists. Items without one are left out.
 */
export async function myNewestStatuses(
  kind: LibraryKind,
  userId: string,
  itemIds: readonly string[],
): Promise<Map<string, SubmissionStatus>> {
  const result = new Map<string, SubmissionStatus>();
  if (itemIds.length === 0 || !isUuid(userId)) {
    return result;
  }
  const column = itemColumn(kind);
  const rows = await getDb()
    .select({ itemId: column, status: submissions.status })
    .from(submissions)
    .where(eq(submissions.submittedBy, userId))
    .orderBy(desc(submissions.submittedAt));
  const wanted = new Set(itemIds);
  for (const r of rows) {
    if (r.itemId && wanted.has(r.itemId) && !result.has(r.itemId)) {
      result.set(r.itemId, r.status);
    }
  }
  return result;
}
