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
  type Exercise,
  type LibraryScope,
} from "@/db/schema";
import { allVisible, requireExerciseAccess, visibleTo } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { requireUser } from "@/lib/auth";
import { byName, libraryAccess, searchPattern } from "@/lib/library";

import { UserError } from "./errors";
import { exerciseInput, name, searchInput } from "./schemas";

export type ExerciseListItem = {
  id: string;
  name: string;
  scope: LibraryScope;
  disciplineName: string | null;
  /** Stations the user may see that support this exercise, by name. */
  stations: { id: string; name: string }[];
};

/** The exercises the user may see, by name, optionally filtered by a name search. */
export async function listExercises(search?: unknown): Promise<ExerciseListItem[]> {
  const user = await requireUser();
  const pattern = searchPattern(searchInput.parse(search));
  const db = getDb();
  const rows = await db
    .select({
      id: exercises.id,
      name: exercises.name,
      scope: exercises.scope,
      disciplineName: exercises.disciplineName,
    })
    .from(exercises)
    .where(
      pattern
        ? and(visibleTo(exercises, user), ilike(exercises.name, pattern))
        : visibleTo(exercises, user),
    );
  if (rows.length === 0) {
    return [];
  }
  const links = await db
    .select({
      exerciseId: stationExercises.exerciseId,
      id: stations.id,
      name: stations.name,
    })
    .from(stationExercises)
    .innerJoin(stations, eq(stations.id, stationExercises.stationId))
    .where(
      and(
        inArray(
          stationExercises.exerciseId,
          rows.map((r) => r.id),
        ),
        visibleTo(stations, user),
      ),
    );
  return rows
    .map((row) => ({
      ...row,
      stations: links
        .filter((l) => l.exerciseId === row.id)
        .map(({ id, name }) => ({ id, name }))
        .sort(byName),
    }))
    .sort(byName);
}

export type ExerciseDetails = {
  exercise: Exercise;
  access: "edit" | "view";
  /** Stations the user may see that support this exercise, by name. */
  stations: { id: string; name: string }[];
  /** How many session activities use the exercise, in anyone's sessions. */
  activityCount: number;
};

/** One exercise with its supporting stations. notFound() without access. */
export async function getExercise(exerciseId: string): Promise<ExerciseDetails> {
  const { user, exercise, access } = await requireExerciseAccess(exerciseId, "view");
  const db = getDb();
  const [linked, [uses]] = await Promise.all([
    db
      .select({ id: stations.id, name: stations.name })
      .from(stationExercises)
      .innerJoin(stations, eq(stations.id, stationExercises.stationId))
      .where(and(eq(stationExercises.exerciseId, exercise.id), visibleTo(stations, user))),
    db
      .select({ n: countDistinct(activityExercises.activityId) })
      .from(activityExercises)
      .where(eq(activityExercises.exerciseId, exercise.id)),
  ]);
  return { exercise, access, stations: linked.sort(byName), activityCount: uses?.n ?? 0 };
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

/**
 * Creates a personal exercise owned by the current user. With a station the
 * user may edit, the station also gets it as a supported exercise, in the
 * same transaction; a station the user may only see or not see is left alone.
 */
export async function createExercise(input: {
  name: unknown;
  stationId?: unknown;
}): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const value = name.parse(input.name);
  const db = getDb();
  const row = { id: crypto.randomUUID(), name: value };
  const insert = db
    .insert(exercises)
    .values({ ...row, scope: "personal", ownerId: user.id });
  const stationId = typeof input.stationId === "string" && isUuid(input.stationId) ? input.stationId : null;
  if (stationId) {
    const [station] = await db
      .select({ scope: stations.scope, ownerId: stations.ownerId })
      .from(stations)
      .where(eq(stations.id, stationId))
      .limit(1);
    if (station && libraryAccess(station, user) === "edit") {
      await db.batch([insert, db.insert(stationExercises).values({ stationId, exerciseId: row.id })]);
      return row;
    }
  }
  await insert;
  return row;
}

/**
 * Saves an exercise's fields and the stations that support it in one
 * transaction. Links from stations the user cannot see are left alone.
 */
export async function updateExercise(exerciseId: string, input: unknown): Promise<void> {
  const { user, exercise } = await requireExerciseAccess(exerciseId, "edit");
  const values = exerciseInput.parse(input);
  if (!(await allVisible(stations, user, values.stationIds))) {
    throw new UserError("invalid");
  }

  const db = getDb();
  const visibleStationIds = db
    .select({ id: stations.id })
    .from(stations)
    .where(visibleTo(stations, user));
  const rest: BatchItem<"pg">[] = [
    db
      .delete(stationExercises)
      .where(
        and(
          eq(stationExercises.exerciseId, exercise.id),
          inArray(stationExercises.stationId, visibleStationIds),
        ),
      ),
  ];
  if (values.stationIds.length > 0) {
    rest.push(
      db
        .insert(stationExercises)
        .values(values.stationIds.map((stationId) => ({ stationId, exerciseId: exercise.id })))
        .onConflictDoNothing(),
    );
  }
  await db.batch([
    db
      .update(exercises)
      .set({
        name: values.name,
        description: values.description,
        focusCues: values.focusCues,
        easierVariant: values.easierVariant,
        harderVariant: values.harderVariant,
        disciplineName: values.disciplineName,
      })
      .where(eq(exercises.id, exercise.id)),
    ...rest,
  ]);
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
