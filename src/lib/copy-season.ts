/**
 * Copying a season: new ids for the copied rows and aligning the source's
 * weeks with the copy's weeks. Pure, so it can be unit-tested; the database
 * work is in src/lib/data/copy-season.ts.
 */
import type { FocusLevel } from "@/db/schema";

/**
 * Maps the n-th week of the source to the n-th week of the copy. Source weeks
 * beyond the copy's last week are left out of the map (their allocations are
 * dropped); copy weeks beyond the source's last week simply get nothing.
 */
export function alignWeeks(
  sourceWeeks: readonly string[],
  targetWeeks: readonly string[],
): Map<string, string> {
  const map = new Map<string, string>();
  const n = Math.min(sourceWeeks.length, targetWeeks.length);
  for (let i = 0; i < n; i++) {
    map.set(sourceWeeks[i], targetWeeks[i]);
  }
  return map;
}

export type SourceSlot = {
  weekday: number;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
};

export type SourceDiscipline = { id: string; name: string; sortOrder: number };

export type SourceFocusItem = {
  id: string;
  disciplineId: string;
  name: string;
  category: string | null;
  sortOrder: number;
};

export type SourceAllocation = { focusItemId: string; weekStart: string; level: FocusLevel };

export type SeasonCopySource = {
  trainingSlots: SourceSlot[];
  disciplines: SourceDiscipline[];
  focusItems: SourceFocusItem[];
  allocations: SourceAllocation[];
};

export type SeasonCopyRows = {
  trainingSlots: (SourceSlot & { seasonId: string })[];
  disciplines: (SourceDiscipline & { seasonId: string })[];
  focusItems: SourceFocusItem[];
  allocations: SourceAllocation[];
};

/**
 * The rows of a copy of a season, with new ids for disciplines and focus
 * items and references remapped to them. Sort orders and categories are kept.
 * Allocations are copied only when `weekMap` is given (see alignWeeks), moved
 * to the aligned week; those whose week has no counterpart, or whose focus
 * item is not part of the source, are dropped.
 */
export function planSeasonCopy(
  source: SeasonCopySource,
  newSeasonId: string,
  newId: () => string,
  weekMap: ReadonlyMap<string, string> | null,
): SeasonCopyRows {
  const disciplineIds = new Map<string, string>();
  const disciplines = source.disciplines.map((d) => {
    const id = newId();
    disciplineIds.set(d.id, id);
    return { id, seasonId: newSeasonId, name: d.name, sortOrder: d.sortOrder };
  });

  const itemIds = new Map<string, string>();
  const focusItems: SourceFocusItem[] = [];
  for (const item of source.focusItems) {
    const disciplineId = disciplineIds.get(item.disciplineId);
    if (disciplineId === undefined) {
      continue;
    }
    const id = newId();
    itemIds.set(item.id, id);
    focusItems.push({
      id,
      disciplineId,
      name: item.name,
      category: item.category,
      sortOrder: item.sortOrder,
    });
  }

  const allocations: SourceAllocation[] = [];
  if (weekMap) {
    for (const a of source.allocations) {
      const focusItemId = itemIds.get(a.focusItemId);
      const weekStart = weekMap.get(a.weekStart);
      if (focusItemId !== undefined && weekStart !== undefined) {
        allocations.push({ focusItemId, weekStart, level: a.level });
      }
    }
  }

  return {
    // Pick the fields: rows read from the database carry ids of the source.
    trainingSlots: source.trainingSlots.map((s) => ({
      seasonId: newSeasonId,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      location: s.location,
    })),
    disciplines,
    focusItems,
    allocations,
  };
}
