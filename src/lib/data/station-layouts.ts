import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { equipment, equipmentConfigurations, stationLayoutItems } from "@/db/schema";
import { equipmentImageUrl } from "@/lib/equipment-configurations";
import type { DrawnLayoutItem, LayoutItemValues } from "@/lib/station-layouts";

export type { DrawnLayoutItem };

/*
 * Station layouts (docs/data-model.md, "Station layout item"). Reading here
 * does not authorise: callers have already checked that the user may read the
 * stations, whether in the library or through a session's activities. A
 * layout is written with its station (src/lib/data/stations.ts, updateStation
 * and copyStation), which checks edit access and prunes what no longer fits.
 */

const L = stationLayoutItems;
const C = equipmentConfigurations;

/**
 * The layouts of the given stations by station id, each in layer order,
 * bottom first, in one query. A station without items has an empty list.
 */
export async function loadStationLayouts(stationIds: readonly string[]): Promise<Map<string, DrawnLayoutItem[]>> {
  const unique = [...new Set(stationIds)];
  const result = new Map<string, DrawnLayoutItem[]>(unique.map((s) => [s, []]));
  if (unique.length === 0) {
    return result;
  }
  const rows = await getDb()
    .select({
      item: L,
      configuration: {
        name: C.name,
        widthCm: C.widthCm,
        lengthCm: C.lengthCm,
        color: C.color,
        imagePathname: C.imagePathname,
      },
      equipmentName: equipment.name,
    })
    .from(L)
    .leftJoin(C, eq(C.id, L.configurationId))
    .leftJoin(equipment, eq(equipment.id, L.equipmentId))
    .where(inArray(L.stationId, unique))
    .orderBy(asc(L.stationId), asc(L.layer), asc(L.id));
  for (const { item: i, configuration: c, equipmentName } of rows) {
    const placement = { id: i.id, xCm: i.xCm, yCm: i.yCm, rotation: i.rotation, label: i.label };
    let drawn: DrawnLayoutItem | null = null;
    if (i.kind === "equipment" && c && i.equipmentId && i.configurationId) {
      drawn = {
        ...placement,
        kind: "equipment",
        equipmentId: i.equipmentId,
        configurationId: i.configurationId,
        equipmentName: equipmentName ?? "",
        configurationName: c.name,
        widthCm: c.widthCm,
        lengthCm: c.lengthCm,
        color: c.color,
        imageUrl: c.imagePathname ? equipmentImageUrl(i.configurationId, c.imagePathname) : null,
      };
    } else if (i.kind === "arrow" && i.lengthCm !== null) {
      drawn = { ...placement, kind: "arrow", lengthCm: i.lengthCm };
    } else if (i.kind === "text" && i.text !== null) {
      drawn = { ...placement, kind: "text", text: i.text };
    }
    if (drawn) {
      result.get(i.stationId)?.push(drawn);
    }
  }
  return result;
}

/** A station's stored layout as saving gets it, in layer order. */
export async function loadLayoutValues(stationId: string): Promise<LayoutItemValues[]> {
  const rows = await getDb()
    .select()
    .from(L)
    .where(eq(L.stationId, stationId))
    .orderBy(asc(L.layer), asc(L.id));
  return rows.flatMap((r): LayoutItemValues[] => {
    const placement = { id: r.id, xCm: r.xCm, yCm: r.yCm, rotation: r.rotation, label: r.label };
    if (r.kind === "equipment" && r.equipmentId && r.configurationId) {
      return [{ ...placement, kind: "equipment", equipmentId: r.equipmentId, configurationId: r.configurationId }];
    }
    if (r.kind === "arrow" && r.lengthCm !== null) {
      return [{ ...placement, kind: "arrow", lengthCm: r.lengthCm }];
    }
    if (r.kind === "text" && r.text !== null) {
      return [{ ...placement, kind: "text", text: r.text }];
    }
    return [];
  });
}

/** Rows to insert for a layout of `stationId`, layer by position in the list. */
export function layoutRows(stationId: string, items: readonly LayoutItemValues[]) {
  return items.map((item, layer) => ({
    id: item.id,
    stationId,
    kind: item.kind,
    equipmentId: item.kind === "equipment" ? item.equipmentId : null,
    configurationId: item.kind === "equipment" ? item.configurationId : null,
    lengthCm: item.kind === "arrow" ? item.lengthCm : null,
    text: item.kind === "text" ? item.text : null,
    xCm: item.xCm,
    yCm: item.yCm,
    rotation: item.rotation,
    layer,
    label: item.label,
  }));
}

/** Each configuration's equipment, for the given configuration ids. */
export async function configurationOwners(configurationIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(configurationIds)];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await getDb()
    .select({ id: C.id, equipmentId: C.equipmentId })
    .from(C)
    .where(inArray(C.id, unique));
  return new Map(rows.map((r) => [r.id, r.equipmentId]));
}

/** True when a configuration is drawn in a station's layout. */
export async function isConfigurationInStationLayout(configurationId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: L.id })
    .from(L)
    .where(eq(L.configurationId, configurationId))
    .limit(1);
  return Boolean(row);
}

/** True when equipment is drawn in a station's layout. */
export async function isEquipmentInStationLayout(equipmentId: string): Promise<boolean> {
  const [row] = await getDb().select({ id: L.id }).from(L).where(eq(L.equipmentId, equipmentId)).limit(1);
  return Boolean(row);
}
