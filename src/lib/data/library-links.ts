import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "@/db";
import { exercises, stationExercises, stations } from "@/db/schema";
import {
  canEditLink,
  planLinkChanges,
  type LibraryItemRef,
  type LibraryUser,
} from "@/lib/library";

import { UserError } from "./errors";

/*
 * Saving which exercises a station supports, from either side. Each link is
 * checked with canEditLink (src/lib/library.ts): a save only adds or removes
 * links the user may change and leaves every other link as it is, so a coach
 * editing their exercise on a global station never touches the global links
 * or other coaches' links, and an administrator never touches coaches' links.
 */

type Ref = LibraryItemRef & { id: string };

/**
 * The statements that make `wantedExerciseIds` the station's supported
 * exercises among those the user may link. Throws UserError("invalid") when
 * the list contains an exercise the user may not link to this station.
 */
export async function stationLinkStatements(
  station: Ref,
  wantedExerciseIds: readonly string[],
  user: LibraryUser,
): Promise<BatchItem<"pg">[]> {
  const db = getDb();
  const [current, candidates] = await Promise.all([
    db
      .select({ id: exercises.id, scope: exercises.scope, ownerId: exercises.ownerId })
      .from(stationExercises)
      .innerJoin(exercises, eq(exercises.id, stationExercises.exerciseId))
      .where(eq(stationExercises.stationId, station.id)),
    wantedExerciseIds.length === 0
      ? Promise.resolve([] as Ref[])
      : db
          .select({ id: exercises.id, scope: exercises.scope, ownerId: exercises.ownerId })
          .from(exercises)
          .where(inArray(exercises.id, [...wantedExerciseIds])),
  ]);
  const plan = planLinkChanges(
    current.map((e) => ({ id: e.id, editable: canEditLink(station, e, user) })),
    wantedExerciseIds,
    new Set(candidates.filter((e) => canEditLink(station, e, user)).map((e) => e.id)),
  );
  if (!plan) {
    throw new UserError("invalid");
  }
  const statements: BatchItem<"pg">[] = [];
  if (plan.remove.length > 0) {
    statements.push(
      db
        .delete(stationExercises)
        .where(
          and(
            eq(stationExercises.stationId, station.id),
            inArray(stationExercises.exerciseId, plan.remove),
          ),
        ),
    );
  }
  if (plan.add.length > 0) {
    statements.push(
      db
        .insert(stationExercises)
        .values(plan.add.map((exerciseId) => ({ stationId: station.id, exerciseId })))
        .onConflictDoNothing(),
    );
  }
  return statements;
}

/** Like stationLinkStatements, for the stations that support an exercise. */
export async function exerciseLinkStatements(
  exercise: Ref,
  wantedStationIds: readonly string[],
  user: LibraryUser,
): Promise<BatchItem<"pg">[]> {
  const db = getDb();
  const [current, candidates] = await Promise.all([
    db
      .select({ id: stations.id, scope: stations.scope, ownerId: stations.ownerId })
      .from(stationExercises)
      .innerJoin(stations, eq(stations.id, stationExercises.stationId))
      .where(eq(stationExercises.exerciseId, exercise.id)),
    wantedStationIds.length === 0
      ? Promise.resolve([] as Ref[])
      : db
          .select({ id: stations.id, scope: stations.scope, ownerId: stations.ownerId })
          .from(stations)
          .where(inArray(stations.id, [...wantedStationIds])),
  ]);
  const plan = planLinkChanges(
    current.map((s) => ({ id: s.id, editable: canEditLink(s, exercise, user) })),
    wantedStationIds,
    new Set(candidates.filter((s) => canEditLink(s, exercise, user)).map((s) => s.id)),
  );
  if (!plan) {
    throw new UserError("invalid");
  }
  const statements: BatchItem<"pg">[] = [];
  if (plan.remove.length > 0) {
    statements.push(
      db
        .delete(stationExercises)
        .where(
          and(
            eq(stationExercises.exerciseId, exercise.id),
            inArray(stationExercises.stationId, plan.remove),
          ),
        ),
    );
  }
  if (plan.add.length > 0) {
    statements.push(
      db
        .insert(stationExercises)
        .values(plan.add.map((stationId) => ({ stationId, exerciseId: exercise.id })))
        .onConflictDoNothing(),
    );
  }
  return statements;
}
