import "server-only";

import { and, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { disciplines, focusAllocations, focusItems, seasons, seasonWeeks } from "@/db/schema";
import { requireSeasonAccess } from "@/lib/access";

import { weekNeedsRow, weekSettingsInput } from "./schemas";

/**
 * Sets the break flag and note of one week. The row in season_weeks is
 * created or updated; it is deleted when the week is neither a break nor has
 * a note. A break week holds no focus, so saving a week as a break also
 * deletes every focus allocation of the season's focus items in that week,
 * in the same transaction. Unmarking a break restores nothing. Requires edit
 * access; the week must be a Monday within the season.
 */
export async function saveSeasonWeek(
  seasonId: string,
  input: unknown,
): Promise<void> {
  await requireSeasonAccess(seasonId, "edit");
  const db = getDb();
  const [season] = await db
    .select({ firstWeek: seasons.firstWeek, lastWeek: seasons.lastWeek })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  const values = weekSettingsInput(season.firstWeek, season.lastWeek).parse(input);

  const weekChange = weekNeedsRow(values)
    ? db
        .insert(seasonWeeks)
        .values({ seasonId, ...values })
        .onConflictDoUpdate({
          target: [seasonWeeks.seasonId, seasonWeeks.weekStart],
          set: { isBreak: values.isBreak, note: values.note },
        })
    : db
        .delete(seasonWeeks)
        .where(
          and(eq(seasonWeeks.seasonId, seasonId), eq(seasonWeeks.weekStart, values.weekStart)),
        );

  if (!values.isBreak) {
    await weekChange;
    return;
  }
  const seasonItemIds = db
    .select({ id: focusItems.id })
    .from(focusItems)
    .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
    .where(eq(disciplines.seasonId, seasonId));
  await db.batch([
    db
      .delete(focusAllocations)
      .where(
        and(
          eq(focusAllocations.weekStart, values.weekStart),
          inArray(focusAllocations.focusItemId, seasonItemIds),
        ),
      ),
    weekChange,
  ]);
}
