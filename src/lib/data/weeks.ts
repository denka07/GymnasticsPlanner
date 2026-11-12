import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { seasons, seasonWeeks } from "@/db/schema";
import { requireSeasonAccess } from "@/lib/access";

import { weekNeedsRow, weekSettingsInput } from "./schemas";

/**
 * Sets the break flag and note of one week. The row in season_weeks is
 * created or updated; it is deleted when the week is neither a break nor has
 * a note. Requires edit access; the week must be a Monday within the season.
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

  if (!weekNeedsRow(values)) {
    await db
      .delete(seasonWeeks)
      .where(
        and(eq(seasonWeeks.seasonId, seasonId), eq(seasonWeeks.weekStart, values.weekStart)),
      );
    return;
  }
  await db
    .insert(seasonWeeks)
    .values({ seasonId, ...values })
    .onConflictDoUpdate({
      target: [seasonWeeks.seasonId, seasonWeeks.weekStart],
      set: { isBreak: values.isBreak, note: values.note },
    });
}
