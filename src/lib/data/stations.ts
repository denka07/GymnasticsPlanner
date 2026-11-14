import "server-only";

import { and, count, eq, ilike, inArray, notExists, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { getDb } from "@/db";
import {
  activities,
  activityExercises,
  equipment,
  exercises,
  stationEquipment,
  stationExercises,
  stations,
  users,
  type LibraryScope,
  type Station,
  type SubmissionStatus,
} from "@/db/schema";
import { requireStationAccess, visibleTo } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  byName,
  canCopy,
  canCreateWithScope,
  canEditLink,
  canSeeCreator,
  isVisibleInLibrary,
  searchPattern,
  type ScopeFilter,
} from "@/lib/library";

import { allEquipmentExists } from "./equipment";
import { UserError } from "./errors";
import { stationLinkStatements } from "./library-links";
import { createLibraryItemInput, idList, searchInput, stationInput } from "./schemas";
import { getReviewState, myNewestStatuses, type ReviewState } from "./submissions";

/** SQL for the items a list shows with a filter: all visible, the user's own, or global. */
export function scopeCondition(
  table: typeof stations | typeof exercises,
  filter: ScopeFilter,
  user: { id: string },
): SQL {
  if (filter === "mine") {
    return and(eq(table.scope, "personal"), eq(table.ownerId, user.id))!;
  }
  if (filter === "global") {
    return eq(table.scope, "global");
  }
  return visibleTo(table, user);
}

export type StationListItem = {
  id: string;
  name: string;
  scope: LibraryScope;
  /** Needed equipment by name. */
  equipment: { name: string; quantity: number }[];
  /** Supported exercises the user may see. */
  exerciseCount: number;
  /** The status of the user's newest submission of the station, if any. */
  status: SubmissionStatus | null;
};

/**
 * The stations the user may see (global and their own), by name, optionally
 * filtered by scope and a name search.
 */
export async function listStations(
  search?: unknown,
  filter: ScopeFilter = "all",
): Promise<StationListItem[]> {
  const user = await requireUser();
  const pattern = searchPattern(searchInput.parse(search));
  const db = getDb();
  const condition = scopeCondition(stations, filter, user);
  const rows = await db
    .select({ id: stations.id, name: stations.name, scope: stations.scope })
    .from(stations)
    .where(pattern ? and(condition, ilike(stations.name, pattern)) : condition);
  if (rows.length === 0) {
    return [];
  }
  const ids = rows.map((r) => r.id);
  const [lines, links, statuses] = await Promise.all([
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
    myNewestStatuses("station", user.id, ids),
  ]);
  return rows
    .map((row) => ({
      ...row,
      status: statuses.get(row.id) ?? null,
      equipment: lines
        .filter((l) => l.stationId === row.id)
        .map(({ name, quantity }) => ({ name, quantity }))
        .sort(byName),
      exerciseCount: links.filter((l) => l.stationId === row.id).length,
    }))
    .sort(byName);
}

export type StationDetails = {
  station: Pick<Station, "id" | "name" | "description" | "scope">;
  access: "edit" | "view";
  equipment: { equipmentId: string; name: string; quantity: number }[];
  /** Supported exercises the user may see, by name, and whether they may unlink each. */
  exercises: { id: string; name: string; scope: LibraryScope; editable: boolean }[];
  /**
   * The user's own personal exercises the station supports, when the station
   * is their personal one: those they may include when submitting it, or make
   * global with it. Empty for everyone else.
   */
  ownersPersonalExercises: { id: string; name: string }[];
  /**
   * How many session activities use the station, in anyone's sessions. Only
   * for those who may edit or delete it; null otherwise.
   */
  activityCount: number | null;
  /** Who created it; only administrators get it, and only for a global station. */
  creatorName: string | null;
  review: ReviewState;
};

/** One station with its equipment and supported exercises. notFound() without access. */
export async function getStation(stationId: string): Promise<StationDetails> {
  const { user, station, access } = await requireStationAccess(stationId, "view");
  const db = getDb();
  const ownerOfPersonal =
    station.scope === "personal" && station.ownerId === user.id ? station.ownerId : null;
  const [lines, linked, [uses], creatorName, review] = await Promise.all([
    db
      .select({
        equipmentId: stationEquipment.equipmentId,
        name: equipment.name,
        quantity: stationEquipment.quantity,
      })
      .from(stationEquipment)
      .innerJoin(equipment, eq(equipment.id, stationEquipment.equipmentId))
      .where(eq(stationEquipment.stationId, station.id)),
    // Every link is read here and filtered below: the viewer gets only the
    // exercises they may see (a reviewer gets the included ones through the
    // review state, not here).
    db
      .select({
        id: exercises.id,
        name: exercises.name,
        scope: exercises.scope,
        ownerId: exercises.ownerId,
      })
      .from(stationExercises)
      .innerJoin(exercises, eq(exercises.id, stationExercises.exerciseId))
      .where(eq(stationExercises.stationId, station.id)),
    access === "edit"
      ? db.select({ n: count() }).from(activities).where(eq(activities.stationId, station.id))
      : Promise.resolve([{ n: 0 }]),
    station.scope === "global" && canSeeCreator(user)
      ? db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, station.createdBy))
          .limit(1)
          .then((rows) => rows[0]?.name ?? null)
      : Promise.resolve(null),
    getReviewState("station", station, user),
  ]);
  return {
    station: {
      id: station.id,
      name: station.name,
      description: station.description,
      scope: station.scope,
    },
    access,
    equipment: lines.sort(byName),
    exercises: linked
      .filter((e) => isVisibleInLibrary(e, user))
      .map((e) => ({
        id: e.id,
        name: e.name,
        scope: e.scope,
        editable: canEditLink(station, e, user),
      }))
      .sort(byName),
    ownersPersonalExercises: ownerOfPersonal
      ? linked
          .filter((e) => e.scope === "personal" && e.ownerId === ownerOfPersonal)
          .map(({ id, name }) => ({ id, name }))
          .sort(byName)
      : [],
    activityCount: access === "edit" ? (uses?.n ?? 0) : null,
    creatorName,
    review,
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

/**
 * Creates a station and returns it: personal and owned by the current user,
 * or global when an administrator asks for that.
 */
export async function createStation(input: {
  name: unknown;
  scope?: unknown;
}): Promise<{ id: string; name: string }> {
  const user = await requireUser();
  const values = createLibraryItemInput.parse(input);
  if (!canCreateWithScope(values.scope, user)) {
    throw new UserError("invalid");
  }
  const [row] = await getDb()
    .insert(stations)
    .values({
      name: values.name,
      scope: values.scope,
      ownerId: values.scope === "personal" ? user.id : null,
      createdBy: user.id,
    })
    .returning({ id: stations.id, name: stations.name });
  return row;
}

/**
 * Saves a station's fields, equipment lines and supported exercises in one
 * transaction. Only links the user may change are added or removed
 * (canEditLink); links to exercises they cannot see are left alone.
 */
export async function updateStation(stationId: string, input: unknown): Promise<void> {
  const { user, station } = await requireStationAccess(stationId, "edit");
  const values = stationInput.parse(input);
  const equipmentIds = values.equipment.map((l) => l.equipmentId);
  const [equipmentOk, links] = await Promise.all([
    allEquipmentExists(equipmentIds),
    stationLinkStatements(station, values.exerciseIds, user),
  ]);
  if (!equipmentOk) {
    throw new UserError("invalid");
  }

  const db = getDb();
  const rest: BatchItem<"pg">[] = [
    db.delete(stationEquipment).where(eq(stationEquipment.stationId, station.id)),
    ...links,
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
  await db.batch([
    db
      .update(stations)
      .set({ name: values.name, description: values.description })
      .where(eq(stations.id, station.id)),
    ...rest,
  ]);
}

/**
 * Deletes a station with its equipment lines and exercise links. Activities
 * that used it lose their station (the foreign key sets it to null); one that
 * would be left with neither exercises nor text gets the station's name as
 * text, in the same transaction.
 */
export async function deleteStation(stationId: string): Promise<void> {
  const { station } = await requireStationAccess(stationId, "edit");
  const db = getDb();
  await db.batch([
    db
      .update(activities)
      .set({ text: station.name })
      .where(
        and(
          eq(activities.stationId, station.id),
          eq(activities.text, ""),
          notExists(
            db
              .select({ one: sql`1` })
              .from(activityExercises)
              .where(eq(activityExercises.activityId, activities.id)),
          ),
        ),
      ),
    db.delete(stations).where(eq(stations.id, station.id)),
  ]);
}

/**
 * Saves which of the user's own exercises a station they can see supports,
 * for example a coach adding their personal exercises to a global station.
 * Only links the user may change are touched; `exerciseIds` lists the ones
 * they want among those.
 */
export async function updateMyStationLinks(stationId: string, exerciseIds: unknown): Promise<void> {
  const { user, station } = await requireStationAccess(stationId, "view");
  const ids = idList.parse(exerciseIds);
  const [first, ...rest] = await stationLinkStatements(station, ids, user);
  if (first) {
    await getDb().batch([first, ...rest]);
  }
}

/**
 * Copies a global station into a new personal one owned by the user, with
 * its equipment lines and its links to the exercises the user can see
 * (global ones and the user's own). The copy is independent of the original.
 */
export async function copyStation(stationId: string): Promise<{ id: string }> {
  const { user, station } = await requireStationAccess(stationId, "view");
  if (!canCopy(station)) {
    throw new UserError("invalid");
  }
  const db = getDb();
  const [lines, linked] = await Promise.all([
    db
      .select({ equipmentId: stationEquipment.equipmentId, quantity: stationEquipment.quantity })
      .from(stationEquipment)
      .where(eq(stationEquipment.stationId, station.id)),
    db
      .select({ id: exercises.id })
      .from(stationExercises)
      .innerJoin(exercises, eq(exercises.id, stationExercises.exerciseId))
      .where(and(eq(stationExercises.stationId, station.id), visibleTo(exercises, user))),
  ]);
  const id = crypto.randomUUID();
  const rest: BatchItem<"pg">[] = [];
  if (lines.length > 0) {
    rest.push(db.insert(stationEquipment).values(lines.map((l) => ({ ...l, stationId: id }))));
  }
  if (linked.length > 0) {
    rest.push(
      db.insert(stationExercises).values(linked.map((e) => ({ stationId: id, exerciseId: e.id }))),
    );
  }
  await db.batch([
    db.insert(stations).values({
      id,
      name: station.name,
      description: station.description,
      scope: "personal",
      ownerId: user.id,
      createdBy: user.id,
    }),
    ...rest,
  ]);
  return { id };
}
