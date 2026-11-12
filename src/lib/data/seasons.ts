import "server-only";

import { and, asc, between, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  disciplines,
  events,
  focusAllocations,
  focusItems,
  groups,
  seasons,
  seasonWeeks,
  trainingSlots,
  type Discipline,
  type Event,
  type FocusItem,
  type FocusLevel,
  type Group,
  type Season,
  type SeasonWeek,
  type TrainingSlot,
} from "@/db/schema";
import {
  requireGroupAccess,
  requireSeasonAccess,
  requireSeasonOwner,
  type AccessLevel,
} from "@/lib/access";

import { weeksBetween } from "@/lib/weeks";

import { seasonInput, type SeasonValues } from "./schemas";

export type DisciplineWithItems = Discipline & { focusItems: FocusItem[] };

/** One coloured cell of the plan grid. */
export type PlanAllocation = {
  focusItemId: string;
  weekStart: string;
  level: FocusLevel;
};

/**
 * Everything the season page shows; keep the season page's loading in this
 * one function.
 */
export type SeasonPlan = {
  access: AccessLevel;
  group: Pick<Group, "id" | "name">;
  season: Season;
  /** By weekday. */
  trainingSlots: TrainingSlot[];
  /** By sort order, each with its focus items by sort order. */
  disciplines: DisciplineWithItems[];
  /** Mondays from the season's first to its last week. */
  weeks: string[];
  /** Allocations of the season's focus items within its weeks. */
  allocations: PlanAllocation[];
  /** Rows of season_weeks within the season's weeks: break flags and notes. */
  weekRows: SeasonWeek[];
  /** All events of the season by start date; some may fall outside its weeks. */
  events: Event[];
};

/** Loads a season's plan. Calls notFound() without view access. */
export async function getSeasonPlan(seasonId: string): Promise<SeasonPlan> {
  const { access } = await requireSeasonAccess(seasonId, "view");
  const db = getDb();

  const [[row], slots, disciplineRows, itemRows, allocationRows, weekRows, eventRows] = await Promise.all([
    db
      .select({ season: seasons, group: { id: groups.id, name: groups.name } })
      .from(seasons)
      .innerJoin(groups, eq(groups.id, seasons.groupId))
      .where(eq(seasons.id, seasonId))
      .limit(1),
    db
      .select()
      .from(trainingSlots)
      .where(eq(trainingSlots.seasonId, seasonId))
      .orderBy(asc(trainingSlots.weekday), asc(trainingSlots.startTime)),
    db
      .select()
      .from(disciplines)
      .where(eq(disciplines.seasonId, seasonId))
      .orderBy(asc(disciplines.sortOrder), asc(disciplines.name)),
    db
      .select({ item: focusItems })
      .from(focusItems)
      .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
      .where(eq(disciplines.seasonId, seasonId))
      .orderBy(asc(focusItems.sortOrder), asc(focusItems.name)),
    db
      .select({
        focusItemId: focusAllocations.focusItemId,
        weekStart: focusAllocations.weekStart,
        level: focusAllocations.level,
      })
      .from(focusAllocations)
      .innerJoin(focusItems, eq(focusItems.id, focusAllocations.focusItemId))
      .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
      .innerJoin(seasons, eq(seasons.id, disciplines.seasonId))
      .where(
        and(
          eq(disciplines.seasonId, seasonId),
          between(focusAllocations.weekStart, seasons.firstWeek, seasons.lastWeek),
        ),
      ),
    db
      .select({ week: seasonWeeks })
      .from(seasonWeeks)
      .innerJoin(seasons, eq(seasons.id, seasonWeeks.seasonId))
      .where(
        and(
          eq(seasonWeeks.seasonId, seasonId),
          between(seasonWeeks.weekStart, seasons.firstWeek, seasons.lastWeek),
        ),
      )
      .orderBy(asc(seasonWeeks.weekStart)),
    db
      .select()
      .from(events)
      .where(eq(events.seasonId, seasonId))
      .orderBy(asc(events.startDate), asc(events.name)),
  ]);

  return {
    access,
    group: row.group,
    season: row.season,
    trainingSlots: slots,
    disciplines: disciplineRows.map((d) => ({
      ...d,
      focusItems: itemRows
        .map((r) => r.item)
        .filter((i) => i.disciplineId === d.id),
    })),
    weeks: weeksBetween(row.season.firstWeek, row.season.lastWeek),
    allocations: allocationRows,
    weekRows: weekRows.map((r) => r.week),
    events: eventRows,
  };
}

function slotRows(seasonId: string, values: SeasonValues) {
  return values.trainingSlots.map((slot) => ({ seasonId, ...slot }));
}

/** Creates a season with its training slots in one transaction; returns its id. */
export async function createSeason(
  groupId: string,
  input: unknown,
): Promise<string> {
  await requireGroupAccess(groupId, "edit");
  const values = seasonInput.parse(input);
  const db = getDb();
  const seasonId = crypto.randomUUID();
  const insertSeason = db.insert(seasons).values({
    id: seasonId,
    groupId,
    name: values.name,
    firstWeek: values.firstWeek,
    lastWeek: values.lastWeek,
  });
  const slots = slotRows(seasonId, values);
  if (slots.length > 0) {
    await db.batch([insertSeason, db.insert(trainingSlots).values(slots)]);
  } else {
    await insertSeason;
  }
  return seasonId;
}

/**
 * Updates name, weeks and training slots in one transaction. Allocations
 * outside a shrunk week range are kept; they are just not shown.
 */
export async function updateSeason(
  seasonId: string,
  input: unknown,
): Promise<void> {
  await requireSeasonAccess(seasonId, "edit");
  const values = seasonInput.parse(input);
  const db = getDb();
  const update = db
    .update(seasons)
    .set({
      name: values.name,
      firstWeek: values.firstWeek,
      lastWeek: values.lastWeek,
    })
    .where(eq(seasons.id, seasonId));
  const clearSlots = db
    .delete(trainingSlots)
    .where(eq(trainingSlots.seasonId, seasonId));
  const slots = slotRows(seasonId, values);
  if (slots.length > 0) {
    await db.batch([update, clearSlots, db.insert(trainingSlots).values(slots)]);
  } else {
    await db.batch([update, clearSlots]);
  }
}

/** Deletes the season and, by cascade, everything in it. Owner only. Returns its group id. */
export async function deleteSeason(seasonId: string): Promise<string> {
  await requireSeasonOwner(seasonId);
  const [row] = await getDb()
    .delete(seasons)
    .where(eq(seasons.id, seasonId))
    .returning({ groupId: seasons.groupId });
  return row.groupId;
}
