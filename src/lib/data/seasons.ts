import "server-only";

import { and, asc, between, eq, gte, inArray, sql } from "drizzle-orm";

import { z, ZodError } from "zod";

import { getDb } from "@/db";
import {
  disciplines,
  events,
  focusAllocations,
  focusItems,
  groups,
  seasons,
  seasonWeeks,
  sessions,
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

import { todayInStockholm } from "@/lib/session-view";
import { weeksBetween } from "@/lib/weeks";

import { pathnamesOfSeason, releaseBlobs } from "./attachment-files";
import { hallsExist } from "./halls";
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
  await requireHalls(values);
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

/** Refuses training slots naming a hall that does not exist. */
async function requireHalls(values: SeasonValues): Promise<void> {
  const ids = values.trainingSlots.flatMap((s) => (s.hallId ? [s.hallId] : []));
  if (!(await hallsExist(ids))) {
    throw invalidInput("hallNotFound");
  }
}

function invalidInput(message: string): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

/**
 * A training slot whose hall a season save changed, with how many of its
 * stored sessions dated today or later have another hall; the user is asked
 * whether to change those too (applySlotHallToUpcoming).
 */
export type SlotHallChange = {
  trainingSlotId: string;
  weekday: number;
  hallId: string | null;
  upcomingCount: number;
};

/** Stored sessions of the slot dated `today` or later whose hall is not the slot's. */
function upcomingWithOtherHall(slotId: string, hallId: string | null, today: string) {
  return and(
    eq(sessions.trainingSlotId, slotId),
    gte(sessions.date, today),
    sql`${sessions.hallId} is distinct from ${hallId}::uuid`,
  );
}

/**
 * Updates name, weeks and training slots in one transaction. Allocations
 * outside a shrunk week range are kept; they are just not shown.
 *
 * Slots are matched by weekday and updated in place, so stored sessions stay
 * linked to their slot. A removed weekday deletes its slot; its stored
 * sessions remain as extra sessions (the link is set to null).
 *
 * Stored sessions keep their hall. Returns the kept slots whose hall changed
 * and that have upcoming sessions with another hall, so the user can be
 * asked whether to change those as well.
 */
export async function updateSeason(
  seasonId: string,
  input: unknown,
): Promise<SlotHallChange[]> {
  await requireSeasonAccess(seasonId, "edit");
  const values = seasonInput.parse(input);
  await requireHalls(values);
  const db = getDb();
  const existing = await db
    .select({ id: trainingSlots.id, weekday: trainingSlots.weekday, hallId: trainingSlots.hallId })
    .from(trainingSlots)
    .where(eq(trainingSlots.seasonId, seasonId));
  const hallBefore = new Map(existing.map((s) => [s.id, s.hallId]));
  const byWeekday = new Map(existing.map((s) => [s.weekday, s.id]));
  const keep = new Set(values.trainingSlots.map((s) => s.weekday));

  const update = db
    .update(seasons)
    .set({
      name: values.name,
      firstWeek: values.firstWeek,
      lastWeek: values.lastWeek,
    })
    .where(eq(seasons.id, seasonId));
  const removed = existing.filter((s) => !keep.has(s.weekday)).map((s) => s.id);
  const statements = [];
  if (removed.length > 0) {
    statements.push(db.delete(trainingSlots).where(inArray(trainingSlots.id, removed)));
  }
  const inserts = [];
  for (const slot of slotRows(seasonId, values)) {
    const slotId = byWeekday.get(slot.weekday);
    if (slotId) {
      statements.push(
        db
          .update(trainingSlots)
          .set({
            startTime: slot.startTime,
            endTime: slot.endTime,
            location: slot.location,
            hallId: slot.hallId,
          })
          .where(eq(trainingSlots.id, slotId)),
      );
    } else {
      inserts.push(slot);
    }
  }
  if (inserts.length > 0) {
    statements.push(db.insert(trainingSlots).values(inserts));
  }
  await db.batch([update, ...statements]);

  const changed = values.trainingSlots.flatMap((slot) => {
    const slotId = byWeekday.get(slot.weekday);
    return slotId && hallBefore.get(slotId) !== slot.hallId
      ? [{ trainingSlotId: slotId, weekday: slot.weekday, hallId: slot.hallId }]
      : [];
  });
  if (changed.length === 0) {
    return [];
  }
  const today = todayInStockholm(new Date());
  const counts = await Promise.all(
    changed.map(async (c) => {
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(sessions)
        .where(upcomingWithOtherHall(c.trainingSlotId, c.hallId, today));
      return { ...c, upcomingCount: n };
    }),
  );
  return counts.filter((c) => c.upcomingCount > 0);
}

/**
 * Gives the slots' stored sessions dated today or later the slot's current
 * hall, after the user agreed to it. Returns how many sessions changed.
 */
export async function applySlotHallToUpcoming(seasonId: string, slotIds: unknown): Promise<number> {
  await requireSeasonAccess(seasonId, "edit");
  const ids = z.array(z.uuid({ error: "invalid" })).min(1).max(7).parse(slotIds);
  const db = getDb();
  const slots = await db
    .select({ id: trainingSlots.id, hallId: trainingSlots.hallId })
    .from(trainingSlots)
    .where(and(eq(trainingSlots.seasonId, seasonId), inArray(trainingSlots.id, ids)));
  if (slots.length !== new Set(ids).size) {
    throw invalidInput("invalid");
  }
  const today = todayInStockholm(new Date());
  const [first, ...rest] = slots.map((s) =>
    db
      .update(sessions)
      .set({ hallId: s.hallId })
      .where(upcomingWithOtherHall(s.id, s.hallId, today))
      .returning({ id: sessions.id }),
  );
  const results = await db.batch([first, ...rest]);
  return results.reduce((n, rows) => n + rows.length, 0);
}

/** Deletes the season and, by cascade, everything in it. Owner only. Returns its group id. */
export async function deleteSeason(seasonId: string): Promise<string> {
  await requireSeasonOwner(seasonId);
  const files = await pathnamesOfSeason(seasonId);
  const [row] = await getDb()
    .delete(seasons)
    .where(eq(seasons.id, seasonId))
    .returning({ groupId: seasons.groupId });
  // Attachments went by cascade; delete the stored files nothing refers to now.
  await releaseBlobs(files);
  return row.groupId;
}
