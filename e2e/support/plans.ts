import { asc, eq, inArray } from "drizzle-orm";

import { db, schema } from "./db";
import { seedHall, seedSeason, seedStation } from "./seed";

/**
 * A session with drawn plans, for the tests that read and print them: parts
 * Samling (Prata), Trampett (Rakt hopp, Volt at the station) and Styrka
 * (Armhävningar); a main plan with a text, and the plan "Banan" for
 * Trampett with the station placed and linked to Volt, so Volt is number 1.
 * A second session in the season has the hall but no plans.
 */
export async function seedSessionWithPlans(prefix: string, hall: { widthCm: number; lengthCm: number }) {
  const hallName = `${prefix} Hallen`;
  const stationName = `${prefix} Trampettstation`;
  const hallId = await seedHall(hallName, hall.widthCm, hall.lengthCm);
  const stationId = await seedStation("coach", stationName);
  const d = db();
  await d.update(schema.stations).set({ description: "Trampetten mot tjockmattan." }).where(eq(schema.stations.id, stationId));
  const season = await seedSeason({
    prefix,
    weekdays: [1],
    sessions: [
      {
        weekday: 1,
        week: 0,
        parts: [
          { title: "Samling", activities: ["Prata"] },
          { title: "Trampett", activities: ["Rakt hopp", { text: "Volt", stationId }] },
          { title: "Styrka", activities: ["Armhävningar"] },
        ],
      },
      { weekday: 1, week: 1, parts: [{ title: "Uppvärmning" }] },
    ],
  });
  const [sessionId, otherSessionId] = season.sessionIds;
  await d.update(schema.sessions).set({ hallId }).where(inArray(schema.sessions.id, season.sessionIds));

  const parts = await d
    .select()
    .from(schema.sessionParts)
    .where(eq(schema.sessionParts.sessionId, sessionId))
    .orderBy(asc(schema.sessionParts.sortOrder));
  const trampett = parts.find((p) => p.title === "Trampett")!;
  const [volt] = await d
    .select()
    .from(schema.activities)
    .where(eq(schema.activities.sessionPartId, trampett.id))
    .orderBy(asc(schema.activities.sortOrder))
    .offset(1);

  const mainId = crypto.randomUUID();
  const partPlanId = crypto.randomUUID();
  await d.batch([
    d.insert(schema.sessionPlans).values([
      { id: mainId, sessionId, isMain: true },
      { id: partPlanId, sessionId, isMain: false, name: "Banan" },
    ]),
    d.insert(schema.sessionPlanParts).values({ sessionPartId: trampett.id, planId: partPlanId }),
    d.insert(schema.planItems).values([
      { id: crypto.randomUUID(), planId: mainId, kind: "text", text: "Samling här", xCm: 500, yCm: 500, layer: 0 },
      {
        id: crypto.randomUUID(),
        planId: partPlanId,
        kind: "station",
        stationId,
        activityId: volt.id,
        xCm: 1000,
        yCm: 1000,
        layer: 0,
      },
    ]),
  ]);
  return { season, sessionId, otherSessionId, hallName, stationName, mainId, partPlanId };
}
