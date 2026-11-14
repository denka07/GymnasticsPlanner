import "server-only";

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { seasons, seasonWeeks, sessionParts, sessions, trainingSlots } from "@/db/schema";
import { getAccessibleGroups } from "@/lib/access";
import { canOpenSeason, canOpenSession, isUuid } from "@/lib/access/levels";
import { requireUser } from "@/lib/auth";
import { todayInStockholm } from "@/lib/session-view";
import {
  groupByDay,
  parseWeekParam,
  weekEnd,
  weekItems,
  type WeekItem,
  type WeekSeasonInput,
  type WeekStoredInput,
} from "@/lib/start-week";
import { mondayOf } from "@/lib/weeks";

export type StartWeek = {
  weekStart: string;
  weekEnd: string;
  currentWeek: string;
  today: string;
  days: { date: string; items: (WeekItem & { canOpenSeason: boolean })[] }[];
};

/**
 * The sessions of one week across every group the user can open, for the
 * start page. A fixed number of queries whatever the number of groups. Only
 * seasons and sessions the user may open are included.
 */
export async function getStartWeek(weekParam: string | string[] | undefined): Promise<StartWeek> {
  const user = await requireUser();
  // The clock is read only after the request-bound lookup above.
  const today = todayInStockholm(new Date());
  const currentWeek = mondayOf(today);
  const weekStart = parseWeekParam(weekParam, currentWeek);
  const sunday = weekEnd(weekStart);
  const base = { weekStart, weekEnd: sunday, currentWeek, today };

  const accessible = await getAccessibleGroups(user.id);
  const groupIds = accessible.map((a) => a.group.id).filter(isUuid);
  if (groupIds.length === 0) {
    return { ...base, days: [] };
  }
  const db = getDb();
  const [seasonRows, sessionRows] = await Promise.all([
    db.select().from(seasons).where(inArray(seasons.groupId, groupIds)),
    db
      .select({
        id: sessions.id,
        seasonId: sessions.seasonId,
        date: sessions.date,
        startTime: sessions.startTime,
        location: sessions.location,
        trainingSlotId: sessions.trainingSlotId,
        isCancelled: sessions.isCancelled,
        partCount: sql<number>`(select count(*)::int from ${sessionParts} where ${sessionParts.sessionId} = ${sessions.id})`,
        groupId: seasons.groupId,
      })
      .from(sessions)
      .innerJoin(seasons, eq(seasons.id, sessions.seasonId))
      .where(
        and(
          inArray(seasons.groupId, groupIds),
          gte(sessions.date, weekStart),
          lte(sessions.date, sunday),
        ),
      ),
  ]);

  const scopes = new Map(accessible.map((a) => [a.group.id, a.scope]));
  const names = new Map(accessible.map((a) => [a.group.id, a.group.name]));
  // Only seasons the user can open take part in placeholders; sessions shared
  // on their own are checked one by one below.
  const openSeasons = seasonRows.filter((s) => {
    const scope = scopes.get(s.groupId);
    return scope !== undefined && canOpenSeason(scope, s.id);
  });
  const inRange = (s: { firstWeek: string; lastWeek: string }) =>
    weekStart >= s.firstWeek && weekStart <= s.lastWeek;
  const rangeIds = openSeasons.filter(inRange).map((s) => s.id);
  const [slotRows, weekRows] =
    rangeIds.length === 0
      ? [[], []]
      : await Promise.all([
          db.select().from(trainingSlots).where(inArray(trainingSlots.seasonId, rangeIds)),
          db
            .select()
            .from(seasonWeeks)
            .where(and(inArray(seasonWeeks.seasonId, rangeIds), eq(seasonWeeks.weekStart, weekStart))),
        ]);

  const stored: WeekStoredInput[] = sessionRows.filter((r) => {
    const scope = scopes.get(r.groupId);
    return scope !== undefined && canOpenSession(scope, r.seasonId, r.id);
  });
  const seasonById = new Map(seasonRows.map((s) => [s.id, s]));
  const openIds = new Set(openSeasons.map((s) => s.id));
  const involved = new Set([...openIds, ...stored.map((s) => s.seasonId)]);
  const inputs: WeekSeasonInput[] = [...involved].flatMap((id) => {
    const season = seasonById.get(id);
    if (!season) return [];
    return [
      {
        seasonId: id,
        groupId: season.groupId,
        groupName: names.get(season.groupId) ?? "",
        slots: slotRows.filter((s) => s.seasonId === id),
        isBreak: weekRows.some((w) => w.seasonId === id && w.isBreak),
        inRange: inRange(season),
        canOpenSeason: openIds.has(id),
      },
    ];
  });

  const items = weekItems(weekStart, inputs, stored).map((item) => ({
    ...item,
    canOpenSeason: openIds.has(item.seasonId),
  }));
  return { ...base, days: groupByDay(items) };
}
