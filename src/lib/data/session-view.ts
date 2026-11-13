import "server-only";

import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { ZodError } from "zod";

import { getDb } from "@/db";
import {
  activities,
  activityExercises,
  equipment,
  exercises,
  groups,
  seasons,
  sessionParts,
  sessions,
  stationEquipment,
  stations,
  type Session,
} from "@/db/schema";
import { getAccessibleGroups, requireSessionAccess, type AccessLevel } from "@/lib/access";
import { isUuid } from "@/lib/access/levels";
import { requireUser } from "@/lib/auth";
import { byName } from "@/lib/library";
import { neighbours, nextSessions, todayInStockholm, type Dated } from "@/lib/session-view";

import { noteAfterInput, tickInput } from "./schemas";

function invalid(message = "invalid"): ZodError {
  return new ZodError([{ code: "custom", message, path: [], input: undefined }]);
}

export type ViewStation = {
  id: string;
  name: string;
  description: string | null;
  equipment: { name: string; quantity: number }[];
};

export type ViewExercise = {
  id: string;
  name: string;
  description: string | null;
  focusCues: string[];
  easierVariant: string | null;
  harderVariant: string | null;
};

export type ViewActivity = {
  id: string;
  text: string;
  station: ViewStation | null;
  exercises: ViewExercise[];
};
export type ViewPart = {
  id: string;
  title: string;
  durationMinutes: number | null;
  isDone: boolean;
  activities: ViewActivity[];
};

export type SessionNeighbour = Dated & { isCancelled: boolean };

export type SessionView = {
  access: AccessLevel;
  session: Session;
  group: { id: string; name: string };
  season: { id: string; name: string };
  parts: ViewPart[];
  previous: SessionNeighbour | null;
  next: SessionNeighbour | null;
};

/**
 * The details of the stations and exercises the given activities link, by
 * activity id. Whoever may view the session sees them, even when they are
 * another user's personal items (docs/data-model.md), so they are not checked
 * against library visibility.
 */
async function loadActivityLinks(
  activityRows: { id: string; stationId: string | null }[],
): Promise<{ stations: Map<string, ViewStation>; exercises: Map<string, ViewExercise[]> }> {
  const db = getDb();
  const stationIds = [...new Set(activityRows.flatMap((a) => (a.stationId ? [a.stationId] : [])))];
  const activityIds = activityRows.map((a) => a.id);
  const [stationRows, equipmentRows, exerciseRows] = await Promise.all([
    stationIds.length === 0
      ? []
      : db
          .select({ id: stations.id, name: stations.name, description: stations.description })
          .from(stations)
          .where(inArray(stations.id, stationIds)),
    stationIds.length === 0
      ? []
      : db
          .select({
            stationId: stationEquipment.stationId,
            name: equipment.name,
            quantity: stationEquipment.quantity,
          })
          .from(stationEquipment)
          .innerJoin(equipment, eq(equipment.id, stationEquipment.equipmentId))
          .where(inArray(stationEquipment.stationId, stationIds)),
    activityIds.length === 0
      ? []
      : db
          .select({
            activityId: activityExercises.activityId,
            id: exercises.id,
            name: exercises.name,
            description: exercises.description,
            focusCues: exercises.focusCues,
            easierVariant: exercises.easierVariant,
            harderVariant: exercises.harderVariant,
          })
          .from(activityExercises)
          .innerJoin(exercises, eq(exercises.id, activityExercises.exerciseId))
          .where(inArray(activityExercises.activityId, activityIds))
          .orderBy(asc(activityExercises.sortOrder)),
  ]);
  const stationMap = new Map<string, ViewStation>();
  for (const s of stationRows) {
    stationMap.set(s.id, {
      ...s,
      equipment: equipmentRows
        .filter((e) => e.stationId === s.id)
        .map(({ name, quantity }) => ({ name, quantity }))
        .sort(byName),
    });
  }
  const exerciseMap = new Map<string, ViewExercise[]>();
  for (const { activityId, ...exercise } of exerciseRows) {
    const list = exerciseMap.get(activityId) ?? [];
    list.push(exercise);
    exerciseMap.set(activityId, list);
  }
  return { stations: stationMap, exercises: exerciseMap };
}

/** One session with its ticks, for the session page. Calls notFound() without view access. */
export async function getSessionView(sessionId: string): Promise<SessionView> {
  const { access } = await requireSessionAccess(sessionId, "view");
  const db = getDb();
  const [[row], partRows, activityRows] = await Promise.all([
    db
      .select({
        session: sessions,
        group: { id: groups.id, name: groups.name },
        season: { id: seasons.id, name: seasons.name },
      })
      .from(sessions)
      .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
      .innerJoin(groups, eq(groups.id, seasons.groupId))
      .where(eq(sessions.id, sessionId))
      .limit(1),
    db
      .select()
      .from(sessionParts)
      .where(eq(sessionParts.sessionId, sessionId))
      .orderBy(asc(sessionParts.sortOrder)),
    db
      .select({ activity: activities })
      .from(activities)
      .innerJoin(sessionParts, eq(sessionParts.id, activities.sessionPartId))
      .where(eq(sessionParts.sessionId, sessionId))
      .orderBy(asc(activities.sortOrder)),
  ]);

  const siblings = await db
    .select({
      id: sessions.id,
      date: sessions.date,
      startTime: sessions.startTime,
      isCancelled: sessions.isCancelled,
    })
    .from(sessions)
    .where(eq(sessions.seasonId, row.session.seasonId));
  const { previous, next } = neighbours(siblings, sessionId);
  const links = await loadActivityLinks(activityRows.map((r) => r.activity));

  const byPart = new Map<string, ViewActivity[]>();
  for (const { activity } of activityRows) {
    const list = byPart.get(activity.sessionPartId) ?? [];
    list.push({
      id: activity.id,
      text: activity.text,
      station: (activity.stationId && links.stations.get(activity.stationId)) || null,
      exercises: links.exercises.get(activity.id) ?? [],
    });
    byPart.set(activity.sessionPartId, list);
  }
  return {
    access,
    session: row.session,
    group: row.group,
    season: row.season,
    parts: partRows.map((p) => ({
      id: p.id,
      title: p.title,
      durationMinutes: p.durationMinutes,
      isDone: p.isDone,
      activities: byPart.get(p.id) ?? [],
    })),
    previous,
    next,
  };
}

/**
 * Ticks or unticks one part. Needs edit access to the session and checks in the
 * database that the part belongs to it. Activities have no done state: all
 * activities of a part happen at the same time.
 */
export async function setPartDone(input: unknown): Promise<void> {
  const { sessionId, partId, done } = tickInput.parse(input);
  await requireSessionAccess(sessionId, "edit");
  const updated = await getDb()
    .update(sessionParts)
    .set({ isDone: done })
    .where(and(eq(sessionParts.id, partId), eq(sessionParts.sessionId, sessionId)))
    .returning({ id: sessionParts.id });
  if (updated.length === 0) {
    throw invalid();
  }
}

/** Clears every tick of a session. Needs edit access. */
export async function resetTicks(sessionId: string): Promise<void> {
  await requireSessionAccess(sessionId, "edit");
  await getDb()
    .update(sessionParts)
    .set({ isDone: false })
    .where(eq(sessionParts.sessionId, sessionId));
}

/** Saves the note after a session (empty clears it). Needs edit access. */
export async function setNoteAfter(sessionId: string, note: unknown): Promise<void> {
  const value = noteAfterInput.parse(note);
  await requireSessionAccess(sessionId, "edit");
  await getDb().update(sessions).set({ noteAfter: value }).where(eq(sessions.id, sessionId));
}

export type NextSession = {
  id: string;
  groupId: string;
  groupName: string;
  date: string;
  startTime: string | null;
  isToday: boolean;
};

/**
 * Per group the user can see, its next stored, non-cancelled session with at
 * least one part, dated today (in Sweden) or later.
 */
export async function listNextSessions(): Promise<NextSession[]> {
  const user = await requireUser();
  // The clock is read only after the request-bound lookup above.
  const today = todayInStockholm(new Date());
  const accessible = await getAccessibleGroups(user.id);
  const groupIds = accessible.map((a) => a.group.id).filter(isUuid);
  if (groupIds.length === 0) {
    return [];
  }
  const rows = await getDb()
    .select({
      id: sessions.id,
      groupId: seasons.groupId,
      date: sessions.date,
      startTime: sessions.startTime,
      isCancelled: sessions.isCancelled,
      partCount: sql<number>`(select count(*)::int from ${sessionParts} where ${sessionParts.sessionId} = ${sessions.id})`,
    })
    .from(sessions)
    .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
    .where(and(inArray(seasons.groupId, groupIds), gte(sessions.date, today)));
  const names = new Map(accessible.map((a) => [a.group.id, a.group.name]));
  return nextSessions(rows, groupIds, today).map((r) => ({
    id: r.id,
    groupId: r.groupId,
    groupName: names.get(r.groupId) ?? "",
    date: r.date,
    startTime: r.startTime,
    isToday: r.date === today,
  }));
}
