import "server-only";

import { asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { activities, activityExercises, exercises, sessionParts, stations } from "@/db/schema";
import type { LinkedItem, LoadedActivity, LoadedPart } from "@/lib/outline";

/**
 * The parts and activities of the given sessions, by session id, with the
 * names of linked stations and exercises. Callers have checked view access to
 * the sessions; linked library items are shown whoever owns them
 * (docs/data-model.md), so they are not filtered by library visibility.
 */
export async function loadOutlines(sessionIds: string[]): Promise<Map<string, LoadedPart[]>> {
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
