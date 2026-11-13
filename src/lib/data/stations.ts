import "server-only";

import { and, eq, ilike, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "@/db";
import {
  equipment,
  exercises,
  stationEquipment,
  stationExercises,
  stations,
  type LibraryScope,
  type Station,
} from "@/db/schema";
import { allVisible, requireStationAccess, visibleTo } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { byName, searchPattern } from "@/lib/library";

import { allEquipmentExists } from "./equipment";
import { UserError } from "./errors";
import { name, searchInput, stationInput } from "./schemas";

export type StationListItem = {
  id: string;
  name: string;
  scope: LibraryScope;
  /** Needed equipment by name. */
  equipment: { name: string; quantity: number }[];
  /** Supported exercises the user may see. */
  exerciseCount: number;
};

/** The stations the user may see, by name, optionally filtered by a name search. */
export async function listStations(search?: unknown): Promise<StationListItem[]> {
  const user = await requireUser();
  const pattern = searchPattern(searchInput.parse(search));
  const db = getDb();
  const rows = await db
    .select({ id: stations.id, name: stations.name, scope: stations.scope })
    .from(stations)
    .where(
      pattern
        ? and(visibleTo(stations, user), ilike(stations.name, pattern))
        : visibleTo(stations, user),
    );
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((r) => r.id);
  const [lines, links] = await Promise.all([
    db
      .select({
        stationId: stationEquipment.stationId,
        name: equipment.name,
        quantity: stationEquipment.quantity,
      })
      .from(stationEquipment)
      .innerJoin(equipment, eq(equipment.id, stationEquipment.equipmentId))
      .where(inArray(stationEquipment.stationId, ids)),
    db
      .select({ stationId: stationExercises.stationId })
      .from(stationExercises)
      .innerJoin(exercises, eq(exercises.id, stationExercises.exerciseId))
      .where(and(inArray(stationExercises.stationId, ids), visibleTo(exercises, user))),
  ]);
  return rows
    .map((row) => ({
      ...row,
      equipment: lines
        .filter((l) => l.stationId === row.id)
        .map(({ name, quantity }) => ({ name, quantity }))
        .sort(byName),
      exerciseCount: links.filter((l) => l.stationId === row.id).length,
    }))
    .sort(byName);
}

export type StationDetails = {
  station: Station;
  access: "edit" | "view";
  equipment: { equipmentId: string; name: string; quantity: number }[];
  /** Supported exercises the user may see, by name. */
  exercises: { id: string; name: string }[];
};

/** One station with its equipment and supported exercises. notFound() without access. */
export async function getStation(stationId: string): Promise<StationDetails> {
  const { user, station, access } = await requireStationAccess(stationId, "view");
  const db = getDb();
  const [lines, linked] = await Promise.all([
    db
      .select({
        equipmentId: stationEquipment.equipmentId,
        name: equipment.name,
        quantity: stationEquipment.quantity,
      })
      .from(stationEquipment)
      .innerJoin(equipment, eq(equipment.id, stationEquipment.equipmentId))
      .where(eq(stationEquipment.stationId, station.id)),
    db
      .select({ id: exercises.id, name: exercises.name })
      .from(stationExercises)
      .innerJoin(exercises, eq(exercises.id, stationExercises.exerciseId))
      .where(and(eq(stationExercises.stationId, station.id), visibleTo(exercises, user))),
  ]);
  return {
    station,
    access,
    equipment: lines.sort(byName),
    exercises: linked.sort(byName),
  };
}

/** The stations the user may see, by name, for pickers. */
export async function listVisibleStationNames(): Promise<{ id: string; name: string }[]> {
  const user = await requireUser();
  const rows = await getDb()
    .select({ id: stations.id, name: stations.name })
    .from(stations)
    .where(visibleTo(stations, user));
  return rows.sort(byName);
}

/** Creates a personal station owned by the current user and returns its id. */
export async function createStation(input: { name: unknown }): Promise<string> {
  const user = await requireUser();
  const value = name.parse(input.name);
  const [row] = await getDb()
    .insert(stations)
    .values({ name: value, scope: "personal", ownerId: user.id })
    .returning({ id: stations.id });
  return row.id;
}

/**
 * Saves a station's fields, equipment lines and supported exercises in one
 * transaction. Links to exercises the user cannot see are left alone.
 */
export async function updateStation(stationId: string, input: unknown): Promise<void> {
  const { user, station } = await requireStationAccess(stationId, "edit");
  const values = stationInput.parse(input);
  const equipmentIds = values.equipment.map((l) => l.equipmentId);
  const [equipmentOk, exercisesOk] = await Promise.all([
    allEquipmentExists(equipmentIds),
    allVisible(exercises, user, values.exerciseIds),
  ]);
  if (!equipmentOk || !exercisesOk) {
    throw new UserError("invalid");
  }

  const db = getDb();
  const visibleExerciseIds = db
    .select({ id: exercises.id })
    .from(exercises)
    .where(visibleTo(exercises, user));
  const rest: BatchItem<"pg">[] = [
    db.delete(stationEquipment).where(eq(stationEquipment.stationId, station.id)),
    db
      .delete(stationExercises)
      .where(
        and(
          eq(stationExercises.stationId, station.id),
          inArray(stationExercises.exerciseId, visibleExerciseIds),
        ),
      ),
  ];
  if (values.equipment.length > 0) {
    rest.push(
      db.insert(stationEquipment).values(
        values.equipment.map((l) => ({
          stationId: station.id,
          equipmentId: l.equipmentId,
          quantity: l.quantity,
        })),
      ),
    );
  }
  if (values.exerciseIds.length > 0) {
    rest.push(
      db
        .insert(stationExercises)
        .values(values.exerciseIds.map((exerciseId) => ({ stationId: station.id, exerciseId })))
        .onConflictDoNothing(),
    );
  }
  await db.batch([
    db
      .update(stations)
      .set({ name: values.name, description: values.description })
      .where(eq(stations.id, station.id)),
    ...rest,
  ]);
}

/** Deletes a station with its equipment lines and exercise links. */
export async function deleteStation(stationId: string): Promise<void> {
  const { station } = await requireStationAccess(stationId, "edit");
  await getDb().delete(stations).where(eq(stations.id, station.id));
}
