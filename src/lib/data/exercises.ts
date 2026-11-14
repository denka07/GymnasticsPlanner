import "server-only";

import { and, countDistinct, eq, ilike, inArray, ne, notExists, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "@/db";
import {
  activities,
  activityExercises,
  exercises,
  stationExercises,
  stations,
  users,
  type Exercise,
  type LibraryScope,
  type SubmissionStatus,
} from "@/db/schema";
import { requireExerciseAccess, visibleTo } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { requireUser } from "@/lib/auth";
import {
  byName,
  canCopy,
  canCreateWithScope,
  canEditLink,
  canSeeCreator,
  searchPattern,
  type ScopeFilter,
} from "@/lib/library";

import { UserError } from "./errors";
import { exerciseLinkStatements } from "./library-links";
import { createLibraryItemInput, exerciseInput, searchInput } from "./schemas";
import { scopeCondition } from "./stations";
import { getReviewState, myNewestStatuses, type ReviewState } from "./submissions";

export type ExerciseListItem = {
  id: string;
  name: string;
  scope: LibraryScope;
  disciplineName: string | null;
  /** Stations the user may see that support this exercise, by name. */
  stations: { id: string; name: string }[];
  /** The status of the user's newest submission of the exercise, if any. */
  status: SubmissionStatus | null;
};

/**
 * The exercises the user may see (global and their own), by name, optionally
 * filtered by scope and a name search.
 */
export async function listExercises(
  search?: unknown,
  filter: ScopeFilter = "all",
): Promise<ExerciseListItem[]> {
  const user = await requireUser();
  const pattern = searchPattern(searchInput.parse(search));
  const db = getDb();
  const condition = scopeCondition(exercises, filter, user);
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      scope: exercises.scope,
      disciplineName: exercises.disciplineName,
    })
    .from(exercises)
    .where(pattern ? and(condition, ilike(exercises.name, pattern)) : condition);
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((r) => r.id);
  const [links, statuses] = await Promise.all([
    db
      .select({
        exerciseId: stationExercises.exerciseId,
        id: stations.id,
        name: stations.name,
      })
      .from(stationExercises)
      .innerJoin(stations, eq(stations.id, stationExercises.stationId))
      .where(and(inArray(stationExercises.exerciseId, ids), visibleTo(stations, user))),
    myNewestStatuses("exercise", user.id, ids),
  ]);
  return rows
    .map((row) => ({
      ...row,
      status: statuses.get(row.id) ?? null,
      stations: links
        .filter((l) => l.exerciseId === row.id)
        .map(({ id, name }) => ({ id, name }))
        .sort(byName),
    }))
    .sort(byName);
}

export type ExerciseDetails = {
  exercise: Pick<Exercise, "id" | "name" | "description" | "disciplineName" | "scope">;
  access: "edit" | "view";
  /** Stations the user may see that support this exercise, by name. */
  stations: { id: string; name: string; scope: LibraryScope; editable: boolean }[];
  /**
   * How many session activities use the exercise, in anyone's sessions. Only
   * for those who may edit or delete it; null otherwise.
   */
  activityCount: number | null;
  /** Who created it; only administrators get it, and only for a global exercise. */
  creatorName: string | null;
  review: ReviewState;
};

/** One exercise with its supporting stations. notFound() without access. */
export async function getExercise(exerciseId: string): Promise<ExerciseDetails> {
  const { user, exercise, access } = await requireExerciseAccess(exerciseId, "view");
  const db = getDb();
  const [linked, [uses], creatorName, review] = await Promise.all([
    db
      .select({
        id: stations.id,
        name: stations.name,
        scope: stations.scope,
        ownerId: stations.ownerId,
      })
      .from(stationExercises)
      .innerJoin(stations, eq(stations.id, stationExercises.stationId))
      .where(and(eq(stationExercises.exerciseId, exercise.id), visibleTo(stations, user))),
    access === "edit"
      ? db
          .select({ n: countDistinct(activityExercises.activityId) })
          .from(activityExercises)
          .where(eq(activityExercises.exerciseId, exercise.id))
      : Promise.resolve([{ n: 0 }]),
    exercise.scope === "global" && canSeeCreator(user)
      ? db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, exercise.createdBy))
          .limit(1)
          .then((rows) => rows[0]?.name ?? null)
      : Promise.resolve(null),
    getReviewState("exercise", exercise, user),
  ]);
  return {
    exercise: {
      id: exercise.id,
      name: exercise.name,
      description: exercise.description,
      disciplineName: exercise.disciplineName,
      scope: exercise.scope,
    },
    access,
    stations: linked
      .map((s) => ({
        id: s.id,
        name: s.name,
        scope: s.scope,
        editable: canEditLink(s, exercise, user),
      }))
      .sort(byName),
    activityCount: access === "edit" ? (uses?.n ?? 0) : null,
    creatorName,
    review,
  };
}

/** The exercises the user may see, by name, for pickers. */
export async function listVisibleExerciseNames(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  const rows = await getDb()
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(visibleTo(exercises, user));
  return rows.sort(byName);
}

/** The user's own personal exercises, by name, for adding them to a global station. */
export async function listOwnExerciseNames(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  const rows = await getDb()
    .select({ id: exercises.id, name: exercises.name })
    .from(exercises)
    .where(and(eq(exercises.scope, "personal"), eq(exercises.ownerId, user.id)));
  return rows.sort(byName);
}

/**
 * Creates an exercise: personal and owned by the current user, or global
 * when an administrator asks for that. With a station, the station also
 * supports it in the same transaction when the user may make that link
 * (canEditLink); otherwise the station is left alone.
 */
export async function createExercise(input: {
  name: unknown;
  scope?: unknown;
  stationId?: unknown;
}): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const values = createLibraryItemInput.parse({ name: input.name, scope: input.scope });
  if (!canCreateWithScope(values.scope, user)) {
    throw new UserError("invalid");
  }
  const db = getDb();
  const row = { id: crypto.randomUUID(), name: values.name };
  const created = {
    scope: values.scope,
    ownerId: values.scope === "personal" ? user.id : null,
  };
  const insert = db.insert(exercises).values({ ...row, ...created, createdBy: user.id });
  const stationId =
    typeof input.stationId === "string" && isUuid(input.stationId) ? input.stationId : null;
  if (stationId) {
    const [station] = await db
      .select({ scope: stations.scope, ownerId: stations.ownerId })
      .from(stations)
      .where(eq(stations.id, stationId))
      .limit(1);
    if (station && canEditLink(station, created, user)) {
      await db.batch([insert, db.insert(stationExercises).values({ stationId, exerciseId: row.id })]);
      return row;
    }
  }
  await insert;
  return row;
}

/**
 * Saves an exercise's fields and the stations that support it in one
 * transaction. Only links the user may change are added or removed
 * (canEditLink); links from stations they cannot see are left alone.
 */
export async function updateExercise(exerciseId: string, input: unknown): Promise<void> {
  const { user, exercise } = await requireExerciseAccess(exerciseId, "edit");
  const values = exerciseInput.parse(input);
  const links = await exerciseLinkStatements(exercise, values.stationIds, user);
  const db = getDb();
  await db.batch([
    db
      .update(exercises)
      .set({
        name: values.name,
        description: values.description,
        disciplineName: values.disciplineName,
      })
      .where(eq(exercises.id, exercise.id)),
    ...links,
  ]);
}

/**
 * Copies a global exercise into a new personal one owned by the user, with
 * its links to the stations the user can see (global ones and their own).
 * The copy is independent of the original.
 */
export async function copyExercise(exerciseId: string): Promise<{ id: string }> {
  const { user, exercise } = await requireExerciseAccess(exerciseId, "view");
  if (!canCopy(exercise)) {
    throw new UserError("invalid");
  }
  const db = getDb();
  const linked = await db
    .select({ id: stations.id })
    .from(stationExercises)
    .innerJoin(stations, eq(stations.id, stationExercises.stationId))
    .where(and(eq(stationExercises.exerciseId, exercise.id), visibleTo(stations, user)));
  const id = crypto.randomUUID();
  const rest: BatchItem<"pg">[] = [];
  if (linked.length > 0) {
    rest.push(
      db.insert(stationExercises).values(linked.map((s) => ({ stationId: s.id, exerciseId: id }))),
    );
  }
  await db.batch([
    db.insert(exercises).values({
      id,
      name: exercise.name,
      description: exercise.description,
      disciplineName: exercise.disciplineName,
      scope: "personal",
      ownerId: user.id,
      createdBy: user.id,
    }),
    ...rest,
  ]);
  return { id };
}

/**
 * Deletes an exercise with its station links, and removes it from the
 * activities that use it. An activity that would be left with neither
 * exercises nor text gets the exercise's name as text, in the same
 * transaction, so it still says what to do.
 */
export async function deleteExercise(exerciseId: string): Promise<void> {
  const { exercise } = await requireExerciseAccess(exerciseId, "edit");
  const db = getDb();
  await db.batch([
    db
      .update(activities)
      .set({ text: exercise.name })
      .where(
        and(
          eq(activities.text, ""),
          inArray(
            activities.id,
            db
              .select({ id: activityExercises.activityId })
              .from(activityExercises)
              .where(eq(activityExercises.exerciseId, exercise.id)),
          ),
          notExists(
            db
              .select({ one: sql`1` })
              .from(activityExercises)
              .where(
                and(
                  eq(activityExercises.activityId, activities.id),
                  ne(activityExercises.exerciseId, exercise.id),
                ),
              ),
          ),
        ),
      ),
    db.delete(exercises).where(eq(exercises.id, exercise.id)),
  ]);
}
