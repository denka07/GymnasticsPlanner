import "server-only";

import { and, eq, inArray, or, sql } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "@/db";
import { disciplines, focusAllocations, focusItems, seasons } from "@/db/schema";
import { requireSeasonAccess } from "@/lib/access";

import { allocationChangesInput } from "./schemas";

/* Focus allocations: the coloured cells of the season plan. */

/**
 * Sets or clears focus levels for a list of cells of a season, all in one
 * transaction. Requires edit access. Every focus item must belong to the
 * season and every week must lie within it; otherwise nothing is written and
 * a ZodError is thrown.
 */
export async function saveFocusAllocations(
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
  const changes = allocationChangesInput(season.firstWeek, season.lastWeek).parse(input);

  // The client says which focus items it changes; check they are this season's.
  const itemIds = [...new Set(changes.map((c) => c.focusItemId))];
  const owned = await db
    .select({ id: focusItems.id })
    .from(focusItems)
    .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
    .where(and(eq(disciplines.seasonId, seasonId), inArray(focusItems.id, itemIds)));
  if (owned.length !== itemIds.length) {
    throw new ZodError([
      { code: "custom", message: "invalid", path: ["focusItemId"], input: itemIds },
    ]);
  }

  const upserts = changes.flatMap((c) =>
    c.level === null ? [] : [{ focusItemId: c.focusItemId, weekStart: c.weekStart, level: c.level }],
  );
  const deletes = changes.filter((c) => c.level === null);

  const statements = [];
  if (upserts.length > 0) {
    statements.push(
      db
        .insert(focusAllocations)
        .values(upserts)
        .onConflictDoUpdate({
          target: [focusAllocations.focusItemId, focusAllocations.weekStart],
          set: { level: sql`excluded.level` },
        }),
    );
  }
  if (deletes.length > 0) {
    statements.push(
      db
        .delete(focusAllocations)
        .where(
          or(
            ...deletes.map((c) =>
              and(
                eq(focusAllocations.focusItemId, c.focusItemId),
                eq(focusAllocations.weekStart, c.weekStart),
              ),
            ),
          ),
        ),
    );
  }
  const [first, ...rest] = statements;
  if (first) {
    await db.batch([first, ...rest]);
  }
}
