import "server-only";

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb } from "@/db";
import { disciplines, focusItems } from "@/db/schema";
import { requireSeasonAccess } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { moveStep, sortOrders, type Direction } from "@/lib/reorder";

import { direction as directionSchema, focusItemInput, name } from "./schemas";

/* Disciplines and focus items of a season: the rows of the season plan. */

/** The season a discipline belongs to; notFound() if there is none. */
async function seasonOfDiscipline(disciplineId: string): Promise<string> {
  if (!isUuid(disciplineId)) {
    notFound();
  }
  const [row] = await getDb()
    .select({ seasonId: disciplines.seasonId })
    .from(disciplines)
    .where(eq(disciplines.id, disciplineId))
    .limit(1);
  if (!row) {
    notFound();
  }
  return row.seasonId;
}

/** The discipline and season a focus item belongs to; notFound() if there is none. */
async function parentsOfFocusItem(
  focusItemId: string,
): Promise<{ disciplineId: string; seasonId: string }> {
  if (!isUuid(focusItemId)) {
    notFound();
  }
  const [row] = await getDb()
    .select({
      disciplineId: focusItems.disciplineId,
      seasonId: disciplines.seasonId,
    })
    .from(focusItems)
    .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
    .where(eq(focusItems.id, focusItemId))
    .limit(1);
  if (!row) {
    notFound();
  }
  return row;
}

/** Rewrites sort orders 0..n-1 for the ids in their new order, in one transaction. */
async function writeDisciplineOrder(ids: string[]): Promise<void> {
  const db = getDb();
  const [first, ...rest] = sortOrders(ids).map(({ id, sortOrder }) =>
    db.update(disciplines).set({ sortOrder }).where(eq(disciplines.id, id)),
  );
  if (first) {
    await db.batch([first, ...rest]);
  }
}

/** Rewrites sort orders 0..n-1 for the ids in their new order, in one transaction. */
async function writeFocusItemOrder(ids: string[]): Promise<void> {
  const db = getDb();
  const [first, ...rest] = sortOrders(ids).map(({ id, sortOrder }) =>
    db.update(focusItems).set({ sortOrder }).where(eq(focusItems.id, id)),
  );
  if (first) {
    await db.batch([first, ...rest]);
  }
}

// --- Disciplines ---------------------------------------------------------

export async function listDisciplines(seasonId: string) {
  await requireSeasonAccess(seasonId, "view");
  return getDb()
    .select()
    .from(disciplines)
    .where(eq(disciplines.seasonId, seasonId))
    .orderBy(asc(disciplines.sortOrder), asc(disciplines.name));
}

const nextDisciplineOrder = (seasonId: string) =>
  sql<number>`(select coalesce(max(${disciplines.sortOrder}) + 1, 0) from ${disciplines} where ${disciplines.seasonId} = ${seasonId})`;

/** Adds a discipline last in the season and returns its id. */
export async function createDiscipline(
  seasonId: string,
  input: { name: unknown },
): Promise<string> {
  await requireSeasonAccess(seasonId, "edit");
  const disciplineName = name.parse(input.name);
  // One statement, so the sort order is read and written together.
  const [row] = await getDb()
    .insert(disciplines)
    .values({
      seasonId,
      name: disciplineName,
      sortOrder: nextDisciplineOrder(seasonId),
    })
    .returning({ id: disciplines.id });
  return row.id;
}

export async function renameDiscipline(
  disciplineId: string,
  input: { name: unknown },
): Promise<void> {
  const seasonId = await seasonOfDiscipline(disciplineId);
  await requireSeasonAccess(seasonId, "edit");
  const disciplineName = name.parse(input.name);
  await getDb()
    .update(disciplines)
    .set({ name: disciplineName })
    .where(eq(disciplines.id, disciplineId));
}

/** Moves a discipline one step up or down. No change at either end. */
export async function moveDiscipline(
  disciplineId: string,
  direction: Direction,
): Promise<void> {
  const seasonId = await seasonOfDiscipline(disciplineId);
  await requireSeasonAccess(seasonId, "edit");
  const dir = directionSchema.parse(direction);
  const siblings = await getDb()
    .select({ id: disciplines.id })
    .from(disciplines)
    .where(eq(disciplines.seasonId, seasonId))
    .orderBy(asc(disciplines.sortOrder), asc(disciplines.name));
  const order = moveStep(
    siblings.map((s) => s.id),
    disciplineId,
    dir,
  );
  if (order) {
    await writeDisciplineOrder(order);
  }
}

/** Deletes a discipline with its focus items and their allocations. */
export async function deleteDiscipline(disciplineId: string): Promise<void> {
  const seasonId = await seasonOfDiscipline(disciplineId);
  await requireSeasonAccess(seasonId, "edit");
  await getDb().delete(disciplines).where(eq(disciplines.id, disciplineId));
}

// --- Focus items ---------------------------------------------------------

export async function listFocusItems(disciplineId: string) {
  const seasonId = await seasonOfDiscipline(disciplineId);
  await requireSeasonAccess(seasonId, "view");
  return getDb()
    .select()
    .from(focusItems)
    .where(eq(focusItems.disciplineId, disciplineId))
    .orderBy(asc(focusItems.sortOrder), asc(focusItems.name));
}

/** Categories already used in the season, alphabetically, for suggestions. */
export async function listCategories(seasonId: string): Promise<string[]> {
  await requireSeasonAccess(seasonId, "view");
  const rows = await getDb()
    .selectDistinct({ category: focusItems.category })
    .from(focusItems)
    .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
    .where(
      and(eq(disciplines.seasonId, seasonId), isNotNull(focusItems.category)),
    )
    .orderBy(asc(focusItems.category));
  return rows.flatMap((r) => (r.category ? [r.category] : []));
}

const nextItemOrder = (disciplineId: string) =>
  sql<number>`(select coalesce(max(${focusItems.sortOrder}) + 1, 0) from ${focusItems} where ${focusItems.disciplineId} = ${disciplineId})`;

/** Adds a focus item last in the discipline and returns its id. */
export async function createFocusItem(
  disciplineId: string,
  input: { name: unknown; category?: unknown },
): Promise<string> {
  const seasonId = await seasonOfDiscipline(disciplineId);
  await requireSeasonAccess(seasonId, "edit");
  const values = focusItemInput.parse(input);
  const [row] = await getDb()
    .insert(focusItems)
    .values({ disciplineId, ...values, sortOrder: nextItemOrder(disciplineId) })
    .returning({ id: focusItems.id });
  return row.id;
}

/** Sets name and category. An empty category clears it. */
export async function updateFocusItem(
  focusItemId: string,
  input: { name: unknown; category?: unknown },
): Promise<void> {
  const { seasonId } = await parentsOfFocusItem(focusItemId);
  await requireSeasonAccess(seasonId, "edit");
  const values = focusItemInput.parse(input);
  await getDb()
    .update(focusItems)
    .set(values)
    .where(eq(focusItems.id, focusItemId));
}

/** Moves a focus item one step up or down within its discipline. */
export async function moveFocusItem(
  focusItemId: string,
  direction: Direction,
): Promise<void> {
  const { seasonId, disciplineId } = await parentsOfFocusItem(focusItemId);
  await requireSeasonAccess(seasonId, "edit");
  const dir = directionSchema.parse(direction);
  const siblings = await getDb()
    .select({ id: focusItems.id })
    .from(focusItems)
    .where(eq(focusItems.disciplineId, disciplineId))
    .orderBy(asc(focusItems.sortOrder), asc(focusItems.name));
  const order = moveStep(
    siblings.map((s) => s.id),
    focusItemId,
    dir,
  );
  if (order) {
    await writeFocusItemOrder(order);
  }
}

/**
 * Moves a focus item to the end of another discipline in the same season.
 * Its allocations go with it.
 */
export async function moveFocusItemToDiscipline(
  focusItemId: string,
  targetDisciplineId: string,
): Promise<void> {
  const { seasonId, disciplineId } = await parentsOfFocusItem(focusItemId);
  await requireSeasonAccess(seasonId, "edit");
  const targetSeasonId = await seasonOfDiscipline(targetDisciplineId);
  if (targetSeasonId !== seasonId) {
    notFound();
  }
  if (targetDisciplineId === disciplineId) {
    return;
  }
  await getDb()
    .update(focusItems)
    .set({
      disciplineId: targetDisciplineId,
      sortOrder: nextItemOrder(targetDisciplineId),
    })
    .where(eq(focusItems.id, focusItemId));
}

/** Deletes a focus item and its allocations. */
export async function deleteFocusItem(focusItemId: string): Promise<void> {
  const { seasonId } = await parentsOfFocusItem(focusItemId);
  await requireSeasonAccess(seasonId, "edit");
  await getDb().delete(focusItems).where(eq(focusItems.id, focusItemId));
}
