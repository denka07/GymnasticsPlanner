import "server-only";

import { and, eq, ilike, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "@/db";
import {
  exercises,
  stationExercises,
  stations,
  type Exercise,
  type LibraryScope,
} from "@/db/schema";
import { allVisible, requireExerciseAccess, visibleTo } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { byName, searchPattern } from "@/lib/library";

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
};

/** One exercise with its supporting stations. notFound() without access. */
export async function getExercise(exerciseId: string): Promise<ExerciseDetails> {
  const { user, exercise, access } = await requireExerciseAccess(exerciseId, "view");
  const linked = await getDb()
    .select({ id: stations.id, name: stations.name })
    .from(stationExercises)
    .innerJoin(stations, eq(stations.id, stationExercises.stationId))
    .where(and(eq(stationExercises.exerciseId, exercise.id), visibleTo(stations, user)));
  return { exercise, access, stations: linked.sort(byName) };
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

/** Creates a personal exercise owned by the current user. */
export async function createExercise(input: {
  name: unknown;
}): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const value = name.parse(input.name);
  const [row] = await getDb()
    .insert(exercises)
    .values({ name: value, scope: "personal", ownerId: user.id })
    .returning({ id: exercises.id, name: exercises.name });
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

/** Deletes an exercise and its station links. */
export async function deleteExercise(exerciseId: string): Promise<void> {
  const { exercise } = await requireExerciseAccess(exerciseId, "edit");
  await getDb().delete(exercises).where(eq(exercises.id, exercise.id));
}
