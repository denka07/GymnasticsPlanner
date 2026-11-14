import "server-only";

import { and, asc, count, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { getDb } from "@/db";
import {
  exercises,
  stationExercises,
  stations,
  submissionExercises,
  submissions,
  users,
  type LibraryScope,
  type SubmissionStatus,
} from "@/db/schema";
import { requireAdmin, requireExerciseAccess, requireStationAccess } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import {
  byName,
  canCopy,
  canMakeGlobal,
  canReview,
  canSubmit,
  canSubmitExercise,
  canWithdraw,
  exercisesToApprove,
  exercisesToMakeGlobal,
  pgErrorCode,
  PG_UNIQUE_VIOLATION,
  planIncludedExercises,
  submissionStatusFor,
  type LibraryItemRef,
  type LibraryUser,
  type StationExerciseCandidate,
} from "@/lib/library";

import { UserError } from "./errors";
import { id as idSchema, idList, reviewCommentInput } from "./schemas";

/*
 * Submitting personal exercises and stations for review, and the
 * administrators' approval and rejection (docs/data-model.md, "Submission").
 * A station submission can include personal exercises of the submitter that
 * the station supports, so they can become global with it. The rules are
 * pure functions in src/lib/library.ts.
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

/**
 * The given user's personal exercises that the station supports: those that
 * may go global with it.
 */
async function ownSupportedExercises(stationId: string, ownerId: string): Promise<StationExerciseCandidate[]> {
  const rows = await getDb()
    .select({ id: exercises.id, scope: exercises.scope, ownerId: exercises.ownerId })
    .from(stationExercises)
    .innerJoin(exercises, eq(exercises.id, stationExercises.exerciseId))
    .where(
      and(
        eq(stationExercises.stationId, stationId),
        eq(exercises.scope, "personal"),
        eq(exercises.ownerId, ownerId),
      ),
    );
  return rows.map((r) => ({ ...r, supported: true }));
}

/** The exercises included in a submission, with whether the station still supports each. */
async function includedExercises(submissionId: string, stationId: string) {
  const rows = await getDb()
    .select({
      id: exercises.id,
      name: exercises.name,
      scope: exercises.scope,
      ownerId: exercises.ownerId,
      linkedStation: stationExercises.stationId,
    })
    .from(submissionExercises)
    .innerJoin(exercises, eq(exercises.id, submissionExercises.exerciseId))
    .leftJoin(
      stationExercises,
      and(
        eq(stationExercises.exerciseId, exercises.id),
        eq(stationExercises.stationId, stationId),
      ),
    )
    .where(eq(submissionExercises.submissionId, submissionId));
  return rows
    .map(({ linkedStation, ...r }) => ({ ...r, supported: linkedStation !== null }))
    .sort(byName);
}

export type IncludedExercise = {
  id: string;
  name: string;
  scope: LibraryScope;
  /** True while it is still personal, the submitter's own and supported by the station. */
  qualifies: boolean;
};

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
  /**
   * For a station: the exercises included in the pending submission (for an
   * administrator) or in the user's newest submission (for the submitter).
   */
  included: IncludedExercise[];
  /**
   * For an exercise: the stations whose pending submission includes it. Only
   * the submitter and administrators get them.
   */
  goesWithStations: { id: string; name: string }[];
  canSubmit: boolean;
  canWithdraw: boolean;
  canReview: boolean;
  canMakeGlobal: boolean;
  canCopy: boolean;
};

/** The pending station submissions that include the exercise, with who submitted them. */
async function pendingStationsIncluding(exerciseId: string) {
  return getDb()
    .select({ id: stations.id, name: stations.name, submittedBy: submissions.submittedBy })
    .from(submissionExercises)
    .innerJoin(submissions, eq(submissions.id, submissionExercises.submissionId))
    .innerJoin(stations, eq(stations.id, submissions.stationId))
    .where(and(eq(submissionExercises.exerciseId, exerciseId), eq(submissions.status, "pending")));
}

/** What the user sees and may do about review on an item they can open. */
export async function getReviewState(
  kind: LibraryKind,
  item: LibraryItemRef & { id: string },
  user: LibraryUser,
): Promise<ReviewState> {
  const [rows, stationsIncluding] = await Promise.all([
    getDb()
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
      .where(eq(itemColumn(kind), item.id)),
    kind === "exercise" ? pendingStationsIncluding(item.id) : Promise.resolve([]),
  ]);
  const pendingRow = rows.find((r) => r.status === "pending") ?? null;
  const mine = submissionStatusFor(rows, user);

  // The submission whose included exercises this user may see.
  const shown = kind === "station" ? (user.isAdmin && pendingRow ? pendingRow : mine) : null;
  const included =
    shown !== null
      ? (await includedExercises(shown.id, item.id)).map((e) => ({
          id: e.id,
          name: e.name,
          scope: e.scope,
          qualifies: exercisesToApprove([e], [e.id], shown.submittedBy).length === 1,
        }))
      : [];
  const goesWithStations = stationsIncluding
    .filter((s) => user.isAdmin || s.submittedBy === user.id)
    .map(({ id, name }) => ({ id, name }))
    .sort(byName);

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
    included,
    goesWithStations,
    canSubmit:
      kind === "exercise"
        ? canSubmitExercise(item, user, pendingRow !== null, stationsIncluding.length > 0)
        : canSubmit(item, user, pendingRow !== null),
    canWithdraw: pendingRow !== null && canWithdraw(pendingRow, user),
    canReview: pendingRow !== null && canReview(pendingRow, item, user),
    canMakeGlobal: canMakeGlobal(item, user),
    canCopy: canCopy(item),
  };
}

/**
 * Submits the user's personal item for review. For a station, `exerciseIds`
 * lists the user's own personal exercises it supports that are to go global
 * with it; anything else in the list refuses the submission. For an exercise
 * the list must be empty, and it cannot be submitted while a pending station
 * submission includes it.
 */
export async function submitForReview(
  kind: LibraryKind,
  itemId: string,
  exerciseIds: unknown = [],
): Promise<void> {
  const { user, item } = await requireItem(kind, itemId, "edit");
  const chosen = idList.parse(exerciseIds);
  const db = getDb();
  const [[pending], stationsIncluding, candidates] = await Promise.all([
    db
      .select({ id: submissions.id })
      .from(submissions)
      .where(and(eq(itemColumn(kind), item.id), eq(submissions.status, "pending")))
      .limit(1),
    kind === "exercise" ? pendingStationsIncluding(item.id) : Promise.resolve([]),
    kind === "station" ? ownSupportedExercises(item.id, user.id) : Promise.resolve([]),
  ]);
  const allowed =
    kind === "exercise"
      ? canSubmitExercise(item, user, pending !== undefined, stationsIncluding.length > 0)
      : canSubmit(item, user, pending !== undefined);
  if (!allowed) {
    throw new UserError(pending || stationsIncluding.length > 0 ? "alreadySubmitted" : "invalid");
  }
  const included = planIncludedExercises(candidates, chosen, user.id);
  if (included === null) {
    throw new UserError("invalid");
  }
  // The id is made here so the submission and its exercises go in one batch.
  const submissionId = crypto.randomUUID();
  const insertSubmission = db.insert(submissions).values({
    id: submissionId,
    ...(kind === "station" ? { stationId: item.id } : { exerciseId: item.id }),
    submittedBy: user.id,
  });
  try {
    if (included.length === 0) {
      await insertSubmission;
    } else {
      await db.batch([
        insertSubmission,
        db
          .insert(submissionExercises)
          .values(included.map((exerciseId) => ({ submissionId, exerciseId }))),
      ]);
    }
  } catch (error) {
    // The database allows one pending submission per item.
    if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
      throw new UserError("alreadySubmitted");
    }
    throw error;
  }
}

/**
 * Withdraws the user's pending submission of an item; it is deleted, and with
 * it the exercises it included.
 */
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
      submittedBy: submissions.submittedBy,
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
 * Statements that turn the given personal exercises of `ownerId` global
 * together with a station, and mark their own pending submissions approved.
 * Each statement re-checks on the database that the exercise is still
 * personal, still the owner's and still supported by the station, and runs
 * only when `guard` holds (the station's approval took place).
 */
function exercisesGoGlobalStatements(
  exerciseIds: readonly string[],
  stationId: string,
  ownerId: string,
  reviewer: { id: string; at: Date },
  guard: ReturnType<typeof exists>,
  extra: ReturnType<typeof exists> | null = null,
) {
  if (exerciseIds.length === 0) {
    return [];
  }
  const db = getDb();
  return [
    db
      .update(exercises)
      .set({ scope: "global", ownerId: null })
      .where(
        and(
          inArray(exercises.id, [...exerciseIds]),
          eq(exercises.scope, "personal"),
          eq(exercises.ownerId, ownerId),
          exists(
            db
              .select({ one: sql`1` })
              .from(stationExercises)
              .where(
                and(
                  eq(stationExercises.stationId, stationId),
                  eq(stationExercises.exerciseId, exercises.id),
                ),
              ),
          ),
          guard,
          ...(extra ? [extra] : []),
        ),
      ),
    // An exercise that went global above may have its own pending submission.
    db
      .update(submissions)
      .set({ status: "approved", reviewedBy: reviewer.id, reviewedAt: reviewer.at, reviewComment: null })
      .where(
        and(
          inArray(submissions.exerciseId, [...exerciseIds]),
          eq(submissions.status, "pending"),
          exists(
            db
              .select({ one: sql`1` })
              .from(exercises)
              .where(and(eq(exercises.id, submissions.exerciseId), eq(exercises.scope, "global"))),
          ),
          guard,
        ),
      ),
  ];
}

/**
 * Approves a pending submission: in one transaction the submission is marked
 * approved and the item itself becomes global (its owner is cleared, its
 * creator kept). Sessions that use it keep working. For a station,
 * `exerciseIds` lists the included exercises the administrator ticked; those
 * that still qualify become global too, and anything not included by the
 * submitter is ignored. Administrators only.
 */
export async function approveSubmission(
  submissionId: string,
  exerciseIds: unknown = [],
): Promise<{ kind: LibraryKind; itemId: string; exerciseIds: string[] }> {
  const { user, submission, kind, item } = await requireReviewable(submissionId);
  const ticked = idList.parse(exerciseIds);
  const db = getDb();
  const table = itemTable(kind);
  const toApprove =
    kind === "station"
      ? exercisesToApprove(await includedExercises(submission.id, item.id), ticked, submission.submittedBy)
      : [];
  const now = new Date();
  // True only once the first statement has approved this very submission, so
  // one that was withdrawn or reviewed meanwhile changes nothing.
  const approvedNow = () =>
    exists(
      db
        .select({ one: sql`1` })
        .from(submissions)
        .where(
          and(
            eq(submissions.id, submission.id),
            eq(submissions.status, "approved"),
            eq(submissions.reviewedBy, user.id),
            eq(submissions.reviewedAt, now),
          ),
        ),
    );
  const includedInSubmission = exists(
    db
      .select({ one: sql`1` })
      .from(submissionExercises)
      .where(
        and(
          eq(submissionExercises.submissionId, submission.id),
          eq(submissionExercises.exerciseId, exercises.id),
        ),
      ),
  );
  await db.batch([
    db
      .update(submissions)
      .set({ status: "approved", reviewedBy: user.id, reviewedAt: now, reviewComment: null })
      .where(and(eq(submissions.id, submission.id), eq(submissions.status, "pending"))),
    db
      .update(table)
      .set({ scope: "global", ownerId: null })
      .where(and(eq(table.id, item.id), eq(table.scope, "personal"), approvedNow())),
    ...exercisesGoGlobalStatements(
      toApprove,
      item.id,
      submission.submittedBy,
      { id: user.id, at: now },
      approvedNow(),
      includedInSubmission,
    ),
  ]);
  return { kind, itemId: item.id, exerciseIds: toApprove };
}

/**
 * Rejects a pending submission with a comment the submitter sees. The item,
 * and any exercises it included, stay personal. Administrators only.
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
 * transaction. For a station, `exerciseIds` lists the administrator's own
 * personal exercises it supports that go global with it; others are ignored.
 */
export async function makeGlobal(
  kind: LibraryKind,
  itemId: string,
  exerciseIds: unknown = [],
): Promise<void> {
  const { user, item } = await requireItem(kind, itemId, "edit");
  if (!canMakeGlobal(item, user)) {
    throw new UserError("invalid");
  }
  const ticked = idList.parse(exerciseIds);
  const db = getDb();
  const table = itemTable(kind);
  const toGlobal =
    kind === "station"
      ? exercisesToMakeGlobal(await ownSupportedExercises(item.id, user.id), ticked, user)
      : [];
  const now = new Date();
  await db.batch([
    db
      .update(submissions)
      .set({ status: "approved", reviewedBy: user.id, reviewedAt: now })
      .where(and(eq(itemColumn(kind), item.id), eq(submissions.status, "pending"))),
    db
      .update(table)
      .set({ scope: "global", ownerId: null })
      .where(and(eq(table.id, item.id), eq(table.ownerId, user.id), eq(table.scope, "personal"))),
    // The exercises follow only if the station became global above.
    ...exercisesGoGlobalStatements(
      toGlobal,
      item.id,
      user.id,
      { id: user.id, at: now },
      exists(
        db
          .select({ one: sql`1` })
          .from(stations)
          .where(and(eq(stations.id, item.id), eq(stations.scope, "global"))),
      ),
    ),
  ]);
}

export type PendingSubmission = {
  id: string;
  kind: LibraryKind;
  itemId: string;
  itemName: string;
  submitterName: string;
  submittedAt: Date;
  /** For a station: how many exercises the submitter included. */
  includedCount: number;
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
      includedCount: sql<number>`(select count(*)::int from ${submissionExercises} where ${submissionExercises.submissionId} = ${submissions.id})`,
    })
    .from(submissions)
    .innerJoin(submitter, eq(submitter.id, submissions.submittedBy))
    .leftJoin(stations, eq(stations.id, submissions.stationId))
    .leftJoin(exercises, eq(exercises.id, submissions.exerciseId))
    .where(eq(submissions.status, "pending"))
    .orderBy(asc(submissions.submittedAt));
  return rows.flatMap((r): PendingSubmission[] => {
    if (r.stationId && r.stationName !== null) {
      return [{ id: r.id, kind: "station" as const, itemId: r.stationId, itemName: r.stationName, submitterName: r.submitterName, submittedAt: r.submittedAt, includedCount: Number(r.includedCount) }];
    }
    if (r.exerciseId && r.exerciseName !== null) {
      return [{ id: r.id, kind: "exercise" as const, itemId: r.exerciseId, itemName: r.exerciseName, submitterName: r.submitterName, submittedAt: r.submittedAt, includedCount: Number(r.includedCount) }];
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
