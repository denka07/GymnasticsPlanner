import "server-only";

import { count, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { equipment, stationEquipment } from "@/db/schema";
import { requireAdmin } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import {
  byName,
  isStillReferenced,
  PG_UNIQUE_VIOLATION,
  pgErrorCode,
} from "@/lib/library";

import { UserError } from "./errors";
import { id, name } from "./schemas";

export type EquipmentEntry = {
  id: string;
  name: string;
  /** Stations of any user that list this equipment; such entries cannot be deleted. */
  stationCount: number;
};

/** The whole catalogue, by name. Any signed-in user may read it. */
export async function listEquipment(): Promise<EquipmentEntry[]> {
  await requireUser();
  const rows = await getDb()
    .select({
      id: equipment.id,
      name: equipment.name,
      stationCount: count(stationEquipment.stationId),
    })
    .from(equipment)
    .leftJoin(stationEquipment, eq(stationEquipment.equipmentId, equipment.id))
    .groupBy(equipment.id);
  return rows.sort(byName);
}

function nameTaken(error: unknown): never {
  if (pgErrorCode(error) === PG_UNIQUE_VIOLATION) {
    throw new UserError("equipmentNameTaken");
  }
  throw error;
}

/** Adds an entry. Administrators only. */
export async function createEquipment(input: { name: unknown }): Promise<string> {
  await requireAdmin();
  const value = name.parse(input.name);
  try {
    const [row] = await getDb()
      .insert(equipment)
      .values({ name: value })
      .returning({ id: equipment.id });
    return row.id;
  } catch (error) {
    nameTaken(error);
  }
}

/** Renames an entry. Administrators only. */
export async function renameEquipment(
  equipmentId: unknown,
  input: { name: unknown },
): Promise<void> {
  await requireAdmin();
  const entryId = id.parse(equipmentId);
  const value = name.parse(input.name);
  try {
    await getDb().update(equipment).set({ name: value }).where(eq(equipment.id, entryId));
  } catch (error) {
    nameTaken(error);
  }
}

/** Deletes an entry that no station uses. Administrators only. */
export async function deleteEquipment(equipmentId: unknown): Promise<void> {
  await requireAdmin();
  const entryId = id.parse(equipmentId);
  try {
    await getDb().delete(equipment).where(eq(equipment.id, entryId));
  } catch (error) {
    // The foreign key from station_equipment restricts deleting used entries.
    if (isStillReferenced(error)) {
      throw new UserError("equipmentInUse");
    }
    throw error;
  }
}

/** True when every id is a catalogue entry. */
export async function allEquipmentExists(ids: readonly string[]): Promise<boolean> {
  if (ids.length === 0) {
    return true;
  }
  const [row] = await getDb()
    .select({ n: count() })
    .from(equipment)
    .where(inArray(equipment.id, [...ids]));
  return row.n === ids.length;
}
