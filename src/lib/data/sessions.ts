import "server-only";

import { and, asc, desc, eq, gte, inArray, lte, notInArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { ZodError } from "zod";

import { getDb } from "@/db";
import {
  activities,
  activityExercises,
  disciplines,
  events,
  exercises,
  focusAllocations,
  focusItems,
  groups,
  seasons,
  seasonWeeks,
  sessionParts,
  sessions,
  stationExercises,
  stations,
  trainingSlots,
  type Event,
  type FocusLevel,
  type Group,
  type Season,
  type Session,
  type TrainingSlot,
} from "@/db/schema";
import {
  allVisible,
  canEdit,
  getSeasonAccess,
  requireSeasonAccess,
  requireSessionAccess,
  visibleTo,
  type AccessLevel,
} from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { requireUser } from "@/lib/auth";
import { byName, libraryAccess } from "@/lib/library";
import type { LinkedItem, LoadedActivity, LoadedPart } from "@/lib/outline";
import { weekSessions, type WeekEntry } from "@/lib/week-sessions";
import { addWeeks, isMonday, mondayOf, weekdayDate } from "@/lib/weeks";

import {
  outlineInput,
  sessionDetailsInput,
  sessionTargetInput,
  type OutlineInput,
} from "./schemas";

function invalid(message = "invalid"): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

// --- Reading ------------------------------------------------------------------

export type StoredSession = Session & { parts: LoadedPart[] };

/**
 * What the activity picker offers: the stations and exercises the user may
 * see, and which exercises each station supports.
 */
export type ActivityLibrary = {
  stations: LinkedItem[];
  exercises: LinkedItem[];
  /** Station id to the ids of the visible exercises it supports. */
  supports: Record<string, string[]>;
  /** Stations whose supported exercises the user may change. */
  editableStationIds: string[];
};

export type WeekFocus = {
  disciplineId: string;
  name: string;
  items: { id: string; name: string; level: FocusLevel }[];
};

/** A session of the season that has content, for "Kopiera från pass…". */
export type CopySource = {
  id: string;
  date: string;
  startTime: string | null;
  location: string | null;
  partCount: number;
};

/** Everything the week page shows; keep its loading in this one function. */
export type WeekPlan = {
  access: AccessLevel;
  group: Pick<Group, "id" | "name">;
  season: Season;
  weekStart: string;
  previousWeek: string | null;
  nextWeek: string | null;
  isBreak: boolean;
  note: string | null;
  /** Events that overlap the week, by start date. */
  events: Event[];
  /** By discipline sort order; disciplines without focus that week are left out. */
  focus: WeekFocus[];
  trainingSlots: TrainingSlot[];
  sessions: WeekEntry<StoredSession>[];
  /** Sessions of the season with at least one part, newest first. */
  copySources: CopySource[];
  /** For linking activities; null without edit access. */
  library: ActivityLibrary | null;
};

/** True when `weekStart` is a Monday within the season. */
function isSeasonWeek(season: Pick<Season, "firstWeek" | "lastWeek">, weekStart: string): boolean {
  try {
    return isMonday(weekStart) && weekStart >= season.firstWeek && weekStart <= season.lastWeek;
  } catch {
    return false;
  }
}

/**
 * The parts and activities of the given sessions, by session id, with the
 * names of linked stations and exercises. Callers have checked view access to
 * the sessions; linked library items are shown whoever owns them
 * (docs/data-model.md), so they are not filtered by library visibility.
 */
async function loadOutlines(sessionIds: string[]): Promise<Map<string, LoadedPart[]>> {
  const result = new Map<string, LoadedPart[]>(sessionIds.map((sid) => [sid, []]));
  if (sessionIds.length === 0) {
    return result;
  }
  const db = getDb();
  const [partRows, activityRows, exerciseRows] = await Promise.all([
    db
      .select()
      .from(sessionParts)
      .where(inArray(sessionParts.sessionId, sessionIds))
      .orderBy(asc(sessionParts.sortOrder)),
    db
      .select({
        activity: activities,
        station: { id: stations.id, name: stations.name },
      })
      .from(activities)
      .innerJoin(sessionParts, eq(sessionParts.id, activities.sessionPartId))
      .leftJoin(stations, eq(stations.id, activities.stationId))
      .where(inArray(sessionParts.sessionId, sessionIds))
      .orderBy(asc(activities.sortOrder)),
    db
      .select({
        activityId: activityExercises.activityId,
        id: exercises.id,
        name: exercises.name,
      })
      .from(activityExercises)
      .innerJoin(exercises, eq(exercises.id, activityExercises.exerciseId))
      .innerJoin(activities, eq(activities.id, activityExercises.activityId))
      .innerJoin(sessionParts, eq(sessionParts.id, activities.sessionPartId))
      .where(inArray(sessionParts.sessionId, sessionIds))
      .orderBy(asc(activityExercises.sortOrder)),
  ]);
  const exercisesByActivity = new Map<string, LinkedItem[]>();
  for (const e of exerciseRows) {
    const list = exercisesByActivity.get(e.activityId) ?? [];
    list.push({ id: e.id, name: e.name });
    exercisesByActivity.set(e.activityId, list);
  }
  const byPart = new Map<string, LoadedActivity[]>();
  for (const { activity, station } of activityRows) {
    const list = byPart.get(activity.sessionPartId) ?? [];
    list.push({
      id: activity.id,
      text: activity.text,
      station,
      exercises: exercisesByActivity.get(activity.id) ?? [],
    });
    byPart.set(activity.sessionPartId, list);
  }
  for (const p of partRows) {
    result.get(p.sessionId)?.push({
      id: p.id,
      title: p.title,
      durationMinutes: p.durationMinutes,
      activities: byPart.get(p.id) ?? [],
    });
  }
  return result;
}

/**
 * Loads one week of a season. Calls notFound() without view access, or when
 * `weekStart` is not a Monday within the season.
 */
export async function getWeekPlan(seasonId: string, weekStart: string): Promise<WeekPlan> {
  const { access } = await requireSeasonAccess(seasonId, "view");
  const db = getDb();
  const [row] = await db
    .select({ season: seasons, group: { id: groups.id, name: groups.name } })
    .from(seasons)
    .innerJoin(groups, eq(groups.id, seasons.groupId))
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!row || !isSeasonWeek(row.season, weekStart)) {
    notFound();
  }
  const sunday = weekdayDate(weekStart, 7);

  const [slots, weekRows, eventRows, focusRows, sessionRows, sourceRows] = await Promise.all([
    db
      .select()
      .from(trainingSlots)
      .where(eq(trainingSlots.seasonId, seasonId))
      .orderBy(asc(trainingSlots.weekday)),
    db
      .select()
      .from(seasonWeeks)
      .where(and(eq(seasonWeeks.seasonId, seasonId), eq(seasonWeeks.weekStart, weekStart)))
      .limit(1),
    db
      .select()
      .from(events)
      .where(
        and(
          eq(events.seasonId, seasonId),
          lte(events.startDate, sunday),
          gte(events.endDate, weekStart),
        ),
      )
      .orderBy(asc(events.startDate), asc(events.name)),
    db
      .select({
        disciplineId: disciplines.id,
        disciplineName: disciplines.name,
        itemId: focusItems.id,
        itemName: focusItems.name,
        level: focusAllocations.level,
      })
      .from(focusAllocations)
      .innerJoin(focusItems, eq(focusItems.id, focusAllocations.focusItemId))
      .innerJoin(disciplines, eq(disciplines.id, focusItems.disciplineId))
      .where(and(eq(disciplines.seasonId, seasonId), eq(focusAllocations.weekStart, weekStart)))
      .orderBy(
        asc(disciplines.sortOrder),
        asc(disciplines.name),
        asc(focusItems.sortOrder),
        asc(focusItems.name),
      ),
    db
      .select()
      .from(sessions)
      .where(
        and(eq(sessions.seasonId, seasonId), gte(sessions.date, weekStart), lte(sessions.date, sunday)),
      ),
    db
      .select({
        id: sessions.id,
        date: sessions.date,
        startTime: sessions.startTime,
        location: sessions.location,
        partCount: sql<number>`count(${sessionParts.id})::int`,
      })
      .from(sessions)
      .innerJoin(sessionParts, eq(sessionParts.sessionId, sessions.id))
      .where(eq(sessions.seasonId, seasonId))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.date), desc(sessions.startTime)),
  ]);

  const [outlines, library] = await Promise.all([
    loadOutlines(sessionRows.map((s) => s.id)),
    canEdit(access) ? loadActivityLibrary() : null,
  ]);
  const stored: StoredSession[] = sessionRows.map((s) => ({ ...s, parts: outlines.get(s.id) ?? [] }));
  const week = weekRows[0];
  const isBreak = week?.isBreak ?? false;

  const focus: WeekFocus[] = [];
  for (const r of focusRows) {
    let group = focus.at(-1);
    if (!group || group.disciplineId !== r.disciplineId) {
      group = { disciplineId: r.disciplineId, name: r.disciplineName, items: [] };
      focus.push(group);
    }
    group.items.push({ id: r.itemId, name: r.itemName, level: r.level });
  }

  const previous = addWeeks(weekStart, -1);
  const next = addWeeks(weekStart, 1);
  return {
    access,
    group: row.group,
    season: row.season,
    weekStart,
    previousWeek: previous >= row.season.firstWeek ? previous : null,
    nextWeek: next <= row.season.lastWeek ? next : null,
    isBreak,
    note: week?.note ?? null,
    events: eventRows,
    focus,
    trainingSlots: slots,
    sessions: weekSessions(slots, weekStart, isBreak, stored),
    copySources: sourceRows,
    library,
  };
}

/** One session for editing on its own, for whoever has edit access to just it. */
export type SessionEditor = {
  access: AccessLevel;
  group: Pick<Group, "id" | "name">;
  season: Pick<Season, "id" | "name">;
  /** True when the user can also open the season (and so its week page). */
  canOpenSeason: boolean;
  session: StoredSession;
  weekStart: string;
  library: ActivityLibrary;
};

/**
 * Loads one stored session for the single-session editor. Calls notFound()
 * without edit access to the session.
 */
export async function getSessionEditor(sessionId: string): Promise<SessionEditor> {
  const { user, access } = await requireSessionAccess(sessionId, "edit");
  const [row] = await getDb()
    .select({
      session: sessions,
      season: { id: seasons.id, name: seasons.name },
      group: { id: groups.id, name: groups.name },
    })
    .from(sessions)
    .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
    .innerJoin(groups, eq(groups.id, seasons.groupId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  const [outlines, library, seasonAccess] = await Promise.all([
    loadOutlines([sessionId]),
    loadActivityLibrary(),
    getSeasonAccess(user.id, row.season.id),
  ]);
  return {
    access,
    group: row.group,
    season: row.season,
    canOpenSeason: seasonAccess !== null,
    session: { ...row.session, parts: outlines.get(sessionId) ?? [] },
    weekStart: mondayOf(row.session.date),
    library,
  };
}

/** The stations and exercises the user may link to activities. */
async function loadActivityLibrary(): Promise<ActivityLibrary> {
  const user = await requireUser();
  const db = getDb();
  const [stationRows, exerciseRows, supportRows] = await Promise.all([
    db
      .select({ id: stations.id, name: stations.name, scope: stations.scope, ownerId: stations.ownerId })
      .from(stations)
      .where(visibleTo(stations, user)),
    db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(visibleTo(exercises, user)),
    db
      .select({ stationId: stationExercises.stationId, exerciseId: stationExercises.exerciseId })
      .from(stationExercises)
      .innerJoin(stations, eq(stations.id, stationExercises.stationId))
      .innerJoin(exercises, eq(exercises.id, stationExercises.exerciseId))
      .where(and(visibleTo(stations, user), visibleTo(exercises, user))),
  ]);
  const supports: Record<string, string[]> = {};
  for (const r of supportRows) {
    (supports[r.stationId] ??= []).push(r.exerciseId);
  }
  return {
    stations: stationRows.map(({ id, name }) => ({ id, name })).sort(byName),
    exercises: exerciseRows.sort(byName),
    supports,
    editableStationIds: stationRows.filter((s) => libraryAccess(s, user) === "edit").map((s) => s.id),
  };
}

// --- Resolving a target ---------------------------------------------------------

type Resolved = { sessionId: string; seasonId: string; date: string };

/**
 * The session an edit goes to, with edit access checked. A placeholder is
 * stored first, copying its slot's date, times and location; if the slot
 * already has a session that week, that one is used.
 */
async function resolveForEdit(input: unknown): Promise<Resolved> {
  const target = sessionTargetInput.parse(input);
  const db = getDb();
  if ("sessionId" in target) {
    await requireSessionAccess(target.sessionId, "edit");
    const [s] = await db
      .select({ seasonId: sessions.seasonId, date: sessions.date })
      .from(sessions)
      .where(eq(sessions.id, target.sessionId))
      .limit(1);
    return { sessionId: target.sessionId, ...s };
  }

  await requireSeasonAccess(target.seasonId, "edit");
  const [slot] = await db
    .select({ slot: trainingSlots, season: seasons })
    .from(trainingSlots)
    .innerJoin(seasons, eq(seasons.id, trainingSlots.seasonId))
    .where(and(eq(trainingSlots.id, target.trainingSlotId), eq(trainingSlots.seasonId, target.seasonId)))
    .limit(1);
  if (!slot || !isSeasonWeek(slot.season, target.weekStart)) {
    throw invalid("weekOutsideSeason");
  }
  const sunday = weekdayDate(target.weekStart, 7);
  const findExisting = () =>
    db
      .select({ id: sessions.id, date: sessions.date })
      .from(sessions)
      .where(
        and(
          eq(sessions.trainingSlotId, slot.slot.id),
          gte(sessions.date, target.weekStart),
          lte(sessions.date, sunday),
        ),
      )
      .limit(1);
  const [existing] = await findExisting();
  if (existing) {
    return { sessionId: existing.id, seasonId: target.seasonId, date: existing.date };
  }
  const [breakRow] = await db
    .select({ isBreak: seasonWeeks.isBreak })
    .from(seasonWeeks)
    .where(and(eq(seasonWeeks.seasonId, target.seasonId), eq(seasonWeeks.weekStart, target.weekStart)))
    .limit(1);
  if (breakRow?.isBreak) {
    // A break week shows no placeholder to edit.
    throw invalid("breakWeek");
  }
  const date = weekdayDate(target.weekStart, slot.slot.weekday);
  const [created] = await db
    .insert(sessions)
    .values({
      seasonId: target.seasonId,
      date,
      startTime: slot.slot.startTime,
      endTime: slot.slot.endTime,
      location: slot.slot.location,
      trainingSlotId: slot.slot.id,
    })
    .onConflictDoNothing()
    .returning({ id: sessions.id });
  if (created) {
    return { sessionId: created.id, seasonId: target.seasonId, date };
  }
  // Stored by someone else meanwhile.
  const [raced] = await findExisting();
  if (!raced) {
    throw invalid();
  }
  return { sessionId: raced.id, seasonId: target.seasonId, date: raced.date };
}

// --- Writing --------------------------------------------------------------------

/**
 * Changes a session's date, times and location; returns its id. The date
 * must stay in the session's week, so the session stays on its week page and
 * its slot keeps one session per week.
 */
export async function updateSessionDetails(target: unknown, input: unknown): Promise<string> {
  const resolved = await resolveForEdit(target);
  const values = sessionDetailsInput.parse(input);
  if (mondayOf(values.date) !== mondayOf(resolved.date)) {
    throw invalid("dateOutsideWeek");
  }
  await getDb().update(sessions).set(values).where(eq(sessions.id, resolved.sessionId));
  return resolved.sessionId;
}

/** Marks a session cancelled or restores it; its content stays. */
export async function setSessionCancelled(target: unknown, cancelled: unknown): Promise<string> {
  const resolved = await resolveForEdit(target);
  if (typeof cancelled !== "boolean") {
    throw invalid();
  }
  await getDb()
    .update(sessions)
    .set({ isCancelled: cancelled })
    .where(eq(sessions.id, resolved.sessionId));
  return resolved.sessionId;
}

/** Adds an extra session (not tied to a slot) on a date within the season. */
export async function createExtraSession(seasonId: string, input: unknown): Promise<string> {
  await requireSeasonAccess(seasonId, "edit");
  const values = sessionDetailsInput.parse(input);
  const db = getDb();
  const [season] = await db
    .select({ firstWeek: seasons.firstWeek, lastWeek: seasons.lastWeek })
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);
  if (!isSeasonWeek(season, mondayOf(values.date))) {
    throw invalid("weekOutsideSeason");
  }
  const [row] = await db
    .insert(sessions)
    .values({ seasonId, ...values })
    .returning({ id: sessions.id });
  return row.id;
}

/** Deletes an extra session. Sessions tied to a training slot cannot be deleted. */
export async function deleteSession(sessionId: string): Promise<void> {
  await requireSessionAccess(sessionId, "edit");
  const db = getDb();
  const [row] = await db
    .select({ trainingSlotId: sessions.trainingSlotId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (row.trainingSlotId !== null) {
    throw invalid("slotSession");
  }
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/**
 * Throws unless every id that is new to this session is unused anywhere, so
 * an upsert by id can never touch another session's rows.
 */
async function checkNewIds(
  table: typeof sessionParts | typeof activities,
  ids: string[],
  known: Set<string>,
) {
  const fresh = ids.filter((i) => !known.has(i));
  if (fresh.length === 0) {
    return;
  }
  const taken = await getDb()
    .select({ id: table.id })
    .from(table)
    .where(inArray(table.id, fresh))
    .limit(1);
  if (taken.length > 0) {
    throw invalid();
  }
}

/**
 * Throws unless the user may see every station and exercise the outline
 * links that the session does not link already. Links the session already
 * has stay allowed, so an editor can keep items someone else linked.
 */
async function checkNewLinks(
  sessionId: string,
  outline: OutlineInput,
  existingStationIds: Set<string>,
) {
  const stationIds = new Set(
    outline.flatMap((p) => p.activities.flatMap((a) => (a.stationId ? [a.stationId] : []))),
  );
  const exerciseIds = new Set(outline.flatMap((p) => p.activities.flatMap((a) => a.exerciseIds)));
  if (stationIds.size === 0 && exerciseIds.size === 0) {
    return;
  }
  const db = getDb();
  const linkedExercises =
    exerciseIds.size === 0
      ? []
      : await db
          .select({ id: activityExercises.exerciseId })
          .from(activityExercises)
          .innerJoin(activities, eq(activities.id, activityExercises.activityId))
          .innerJoin(sessionParts, eq(sessionParts.id, activities.sessionPartId))
          .where(eq(sessionParts.sessionId, sessionId));
  const known = new Set(linkedExercises.map((e) => e.id));
  const user = await requireUser();
  const [stationsOk, exercisesOk] = await Promise.all([
    allVisible(stations, user, [...stationIds].filter((i) => !existingStationIds.has(i))),
    allVisible(exercises, user, [...exerciseIds].filter((i) => !known.has(i))),
  ]);
  if (!stationsOk || !exercisesOk) {
    throw invalid();
  }
}

/** The statements that make a session's outline equal `outline`. */
async function outlineStatements(sessionId: string, outline: OutlineInput) {
  const db = getDb();
  const [existingParts, existingActivities] = await Promise.all([
    db.select({ id: sessionParts.id }).from(sessionParts).where(eq(sessionParts.sessionId, sessionId)),
    db
      .select({ id: activities.id, stationId: activities.stationId })
      .from(activities)
      .innerJoin(sessionParts, eq(sessionParts.id, activities.sessionPartId))
      .where(eq(sessionParts.sessionId, sessionId)),
  ]);
  const partIds = outline.map((p) => p.id);
  const activityIds = outline.flatMap((p) => p.activities.map((a) => a.id));
  const existingStationIds = new Set(
    existingActivities.flatMap((a) => (a.stationId ? [a.stationId] : [])),
  );
  await Promise.all([
    checkNewIds(sessionParts, partIds, new Set(existingParts.map((p) => p.id))),
    checkNewIds(activities, activityIds, new Set(existingActivities.map((a) => a.id))),
    checkNewLinks(sessionId, outline, existingStationIds),
  ]);

  const partsOfSession = db
    .select({ id: sessionParts.id })
    .from(sessionParts)
    .where(eq(sessionParts.sessionId, sessionId));
  const statements = [
    // Removed activities, including ones under parts that stay.
    db
      .delete(activities)
      .where(
        and(
          inArray(activities.sessionPartId, partsOfSession),
          activityIds.length > 0 ? notInArray(activities.id, activityIds) : undefined,
        ),
      ),
    db
      .delete(sessionParts)
      .where(
        and(
          eq(sessionParts.sessionId, sessionId),
          partIds.length > 0 ? notInArray(sessionParts.id, partIds) : undefined,
        ),
      ),
  ] as const;
  const writes = [];
  if (outline.length > 0) {
    writes.push(
      db
        .insert(sessionParts)
        .values(
          outline.map((p, i) => ({
            id: p.id,
            sessionId,
            title: p.title,
            sortOrder: i,
            durationMinutes: p.durationMinutes,
          })),
        )
        .onConflictDoUpdate({
          target: sessionParts.id,
          // The session never changes: new ids were checked to be unused.
          set: {
            title: sql`excluded.title`,
            sortOrder: sql`excluded.sort_order`,
            durationMinutes: sql`excluded.duration_minutes`,
          },
        }),
    );
  }
  const activityRows = outline.flatMap((p) =>
    p.activities.map((a, i) => ({
      id: a.id,
      sessionPartId: p.id,
      stationId: a.stationId,
      text: a.text,
      sortOrder: i,
    })),
  );
  if (activityRows.length > 0) {
    writes.push(
      db
        .insert(activities)
        .values(activityRows)
        .onConflictDoUpdate({
          target: activities.id,
          // An activity may move to another part of the same session.
          set: {
            sessionPartId: sql`excluded.session_part_id`,
            stationId: sql`excluded.station_id`,
            text: sql`excluded.text`,
            sortOrder: sql`excluded.sort_order`,
          },
        }),
    );
  }
  // Exercise links are rewritten whole: cleared for every activity of the
  // session (after the upserts, so moved activities are included), then
  // inserted again in order.
  writes.push(
    db.delete(activityExercises).where(
      inArray(
        activityExercises.activityId,
        db.select({ id: activities.id }).from(activities).where(inArray(activities.sessionPartId, partsOfSession)),
      ),
    ),
  );
  const exerciseRows = outline.flatMap((p) =>
    p.activities.flatMap((a) =>
      a.exerciseIds.map((exerciseId, i) => ({ activityId: a.id, exerciseId, sortOrder: i })),
    ),
  );
  if (exerciseRows.length > 0) {
    writes.push(db.insert(activityExercises).values(exerciseRows));
  }
  // Upserts first: an activity moved out of a removed part must already point
  // at its new part when the removed part's cascade runs.
  return [...writes, ...statements];
}

/**
 * Makes a session's parts and activities equal the given outline, in one
 * transaction: rows whose ids are kept are updated (so done flags survive),
 * new ids are inserted, missing ones deleted, and sort orders rewritten.
 * Returns the session id (new when a placeholder was stored).
 */
export async function saveSessionOutline(target: unknown, input: unknown): Promise<string> {
  const outline = outlineInput.parse(input);
  const resolved = await resolveForEdit(target);
  const statements = await outlineStatements(resolved.sessionId, outline);
  await getDb().batch(statements as [(typeof statements)[number], ...typeof statements]);
  return resolved.sessionId;
}

/**
 * Replaces the target's parts and activities with copies of the source's,
 * durations included; done flags start cleared and the note is not copied.
 * Needs view access to the source and edit access to the target. Returns the
 * target session id and its new outline.
 */
export async function copySessionContent(
  sourceSessionId: string,
  target: unknown,
): Promise<{ sessionId: string; parts: LoadedPart[] }> {
  if (!isUuid(sourceSessionId)) {
    notFound();
  }
  await requireSessionAccess(sourceSessionId, "view");
  const resolved = await resolveForEdit(target);
  if (resolved.sessionId === sourceSessionId) {
    throw invalid();
  }
  const source = (await loadOutlines([sourceSessionId])).get(sourceSessionId) ?? [];
  // Station and exercise links are copied as they are, like the text.
  const parts: LoadedPart[] = source.map((p) => ({
    id: crypto.randomUUID(),
    title: p.title,
    durationMinutes: p.durationMinutes,
    activities: p.activities.map((a) => ({ ...a, id: crypto.randomUUID() })),
  }));
  const db = getDb();
  // Deleting the parts deletes their activities too; the new rows start not done.
  const clear = db.delete(sessionParts).where(eq(sessionParts.sessionId, resolved.sessionId));
  const inserts = [];
  if (parts.length > 0) {
    inserts.push(
      db.insert(sessionParts).values(
        parts.map((p, i) => ({
          id: p.id,
          sessionId: resolved.sessionId,
          title: p.title,
          sortOrder: i,
          durationMinutes: p.durationMinutes,
        })),
      ),
    );
    const activityRows = parts.flatMap((p) =>
      p.activities.map((a, i) => ({
        id: a.id,
        sessionPartId: p.id,
        stationId: a.station?.id ?? null,
        text: a.text,
        sortOrder: i,
      })),
    );
    if (activityRows.length > 0) {
      inserts.push(db.insert(activities).values(activityRows));
    }
    const exerciseRows = parts.flatMap((p) =>
      p.activities.flatMap((a) =>
        a.exercises.map((e, i) => ({ activityId: a.id, exerciseId: e.id, sortOrder: i })),
      ),
    );
    if (exerciseRows.length > 0) {
      inserts.push(db.insert(activityExercises).values(exerciseRows));
    }
  }
  await db.batch([clear, ...inserts]);
  return { sessionId: resolved.sessionId, parts };
}
