import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  disciplines,
  focusAllocations,
  focusItems,
  seasons,
  trainingSlots,
} from "@/db/schema";
import { requireGroupAccess, requireSeasonAccess } from "@/lib/access";
import { alignWeeks, planSeasonCopy } from "@/lib/copy-season";
import { weeksBetween } from "@/lib/weeks";

import { copySeasonInput } from "./schemas";

/**
 * Copies a season into a group and returns the new season id. Requires view
 * access to the source season and edit access to the target group.
 *
 * Copies training slots, disciplines and focus items (order and categories
 * kept). With `includeAllocations`, also the focus allocations, aligned by
 * position: the n-th week of the source becomes the n-th week of the copy and
 * allocations beyond the last week of the copy are dropped. Events, break
 * weeks and week notes are not copied. All rows are written in one transaction.
 */
export async function copySeason(
  sourceSeasonId: string,
  input: unknown,
): Promise<string> {
  await requireSeasonAccess(sourceSeasonId, "view");
  const values = copySeasonInput.parse(input);
  await requireGroupAccess(values.groupId, "edit");
  const db = getDb();

  const [[source], slotRows, disciplineRows, itemRows] = await Promise.all([
    db.select().from(seasons).where(eq(seasons.id, sourceSeasonId)).limit(1),
    db.select().from(trainingSlots).where(eq(trainingSlots.seasonId, sourceSeasonId)),
    db
      .select()
      .from(disciplines)
      .where(eq(disciplines.seasonId, sourceSeasonId))
      .orderBy(asc(disciplines.sortOrder)),
    db
      .select({ item: focusItems })
      .from(focusItems)
      .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
      .where(eq(disciplines.seasonId, sourceSeasonId))
      .orderBy(asc(focusItems.sortOrder)),
  ]);
  const items = itemRows.map((r) => r.item);

  const allocationRows =
    values.includeAllocations && items.length > 0
      ? await db
          .select()
          .from(focusAllocations)
          .where(
            inArray(
              focusAllocations.focusItemId,
              items.map((i) => i.id),
            ),
          )
      : [];

  const newSeasonId = crypto.randomUUID();
  const rows = planSeasonCopy(
    {
      trainingSlots: slotRows,
      disciplines: disciplineRows,
      focusItems: items,
      allocations: allocationRows,
    },
    newSeasonId,
    () => crypto.randomUUID(),
    values.includeAllocations
      ? alignWeeks(
          weeksBetween(source.firstWeek, source.lastWeek),
          weeksBetween(values.firstWeek, values.lastWeek),
        )
      : null,
  );

  // One batch is one transaction: either everything is written or nothing.
  const insertSeason = db.insert(seasons).values({
    id: newSeasonId,
    groupId: values.groupId,
    name: values.name,
    firstWeek: values.firstWeek,
    lastWeek: values.lastWeek,
  });
  const more = [
    rows.trainingSlots.length > 0 && db.insert(trainingSlots).values(rows.trainingSlots),
    rows.disciplines.length > 0 && db.insert(disciplines).values(rows.disciplines),
    rows.focusItems.length > 0 && db.insert(focusItems).values(rows.focusItems),
    rows.allocations.length > 0 && db.insert(focusAllocations).values(rows.allocations),
  ].filter((s) => s !== false);
  await db.batch([insertSeason, ...more]);
  return newSeasonId;
}
