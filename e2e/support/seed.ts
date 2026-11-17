import { addWeeks, mondayOfIsoWeek, weekdayDate } from "../../src/lib/weeks";

import { db, devUserId, schema } from "./db";

/**
 * Small set-up helpers that write test data straight into the database, for
 * tests whose subject is not creating that data. Every name must carry the
 * test's prefix so the clean-up finds it.
 */

export type SeedActivity = { text: string; stationId?: string; exerciseIds?: string[] };
export type SeedPart = { title: string; minutes?: number; activities?: (string | SeedActivity)[] };
export type SeedSession = {
  /** ISO weekday of a training slot of the season (1 = Monday). */
  weekday: number;
  /** Week of the season, 0 = the first. */
  week: number;
  parts?: SeedPart[];
  noteAfter?: string;
  isCancelled?: boolean;
};

export type SeedEvent = {
  name: string;
  type?: "competition" | "camp" | "show" | "other";
  /** Week of the season (0 = the first) and ISO weekday the event starts on. */
  week: number;
  weekday: number;
  /** Days the event lasts; 1 = a single day. */
  days?: number;
  description?: string;
};

export type SeededSeason = {
  groupId: string;
  groupName: string;
  seasonId: string;
  seasonName: string;
  firstWeek: string;
  weeks: string[];
  /** Session ids in the order given. */
  sessionIds: string[];
  slotIds: Record<number, string>;
};

/**
 * A group owned by the coach with one season of `weekCount` weeks starting
 * at ISO week `start`, training slots on the given weekdays (17:00–18:30,
 * "E2E-hallen") and the given stored sessions.
 */
export async function seedSeason({
  prefix,
  start = { year: 2031, week: 10 },
  weekCount = 4,
  weekdays = [1, 3],
  sessions = [],
  events = [],
}: {
  prefix: string;
  start?: { year: number; week: number };
  weekCount?: number;
  weekdays?: number[];
  sessions?: SeedSession[];
  events?: SeedEvent[];
}): Promise<SeededSeason> {
  if (!prefix.startsWith("E2E ")) {
    throw new Error("Seeded names must start with the E2E prefix.");
  }
  const d = db();
  const ownerId = await devUserId("coach");
  const firstWeek = mondayOfIsoWeek(start.year, start.week);
  const weeks = Array.from({ length: weekCount }, (_, i) => addWeeks(firstWeek, i));
  const groupId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const groupName = `${prefix} Trupp`;
  const seasonName = `${prefix} Säsong`;
  const slotIds: Record<number, string> = {};
  for (const weekday of weekdays) {
    slotIds[weekday] = crypto.randomUUID();
  }

  const sessionRows: (typeof schema.sessions.$inferInsert)[] = [];
  const partRows: (typeof schema.sessionParts.$inferInsert)[] = [];
  const activityRows: (typeof schema.activities.$inferInsert)[] = [];
  const linkRows: (typeof schema.activityExercises.$inferInsert)[] = [];
  for (const s of sessions) {
    const sessionId = crypto.randomUUID();
    sessionRows.push({
      id: sessionId,
      seasonId,
      date: weekdayDate(weeks[s.week], s.weekday),
      startTime: "17:00",
      endTime: "18:30",
      location: "E2E-hallen",
      trainingSlotId: slotIds[s.weekday],
      noteAfter: s.noteAfter ?? null,
      isCancelled: s.isCancelled ?? false,
    });
    (s.parts ?? []).forEach((p, pi) => {
      const partId = crypto.randomUUID();
      partRows.push({
        id: partId,
        sessionId,
        title: p.title,
        sortOrder: pi,
        durationMinutes: p.minutes ?? null,
      });
      (p.activities ?? []).forEach((a, ai) => {
        const activity = typeof a === "string" ? { text: a } : a;
        const activityId = crypto.randomUUID();
        activityRows.push({
          id: activityId,
          sessionPartId: partId,
          text: activity.text,
          stationId: activity.stationId ?? null,
          sortOrder: ai,
        });
        (activity.exerciseIds ?? []).forEach((exerciseId, ei) =>
          linkRows.push({ activityId, exerciseId, sortOrder: ei }),
        );
      });
    });
  }

  await d.batch([
    d.insert(schema.groups).values({ id: groupId, ownerId, name: groupName }),
    d.insert(schema.seasons).values({
      id: seasonId,
      groupId,
      name: seasonName,
      firstWeek,
      lastWeek: weeks[weeks.length - 1],
    }),
    d.insert(schema.trainingSlots).values(
      weekdays.map((weekday) => ({
        id: slotIds[weekday],
        seasonId,
        weekday,
        startTime: "17:00",
        endTime: "18:30",
        location: "E2E-hallen",
      })),
    ),
    ...(events.length
      ? [
          d.insert(schema.events).values(
            events.map((e) => ({
              seasonId,
              name: e.name,
              type: e.type ?? "competition",
              startDate: weekdayDate(weeks[e.week], e.weekday),
              endDate: plusDays(weekdayDate(weeks[e.week], e.weekday), (e.days ?? 1) - 1),
              description: e.description ?? null,
            })),
          ),
        ]
      : []),
    ...(sessionRows.length ? [d.insert(schema.sessions).values(sessionRows)] : []),
    ...(partRows.length ? [d.insert(schema.sessionParts).values(partRows)] : []),
    ...(activityRows.length ? [d.insert(schema.activities).values(activityRows)] : []),
    ...(linkRows.length ? [d.insert(schema.activityExercises).values(linkRows)] : []),
  ] as unknown as Parameters<typeof d.batch>[0]);

  return {
    groupId,
    groupName,
    seasonId,
    seasonName,
    firstWeek,
    weeks,
    sessionIds: sessionRows.map((s) => s.id!),
    slotIds,
  };
}

/** A personal exercise of the given test user. */
export async function seedExercise(
  owner: "coach" | "helper",
  name: string,
  description?: string,
): Promise<string> {
  const ownerId = await devUserId(owner);
  const id = crypto.randomUUID();
  await db()
    .insert(schema.exercises)
    .values({ id, name, description, scope: "personal", ownerId, createdBy: ownerId });
  return id;
}

/** A personal station of the given test user that supports `exerciseIds`. */
export async function seedStation(
  owner: "coach" | "helper",
  name: string,
  exerciseIds: string[] = [],
): Promise<string> {
  const ownerId = await devUserId(owner);
  const id = crypto.randomUUID();
  const d = db();
  await d.batch([
    d.insert(schema.stations).values({ id, name, scope: "personal", ownerId, createdBy: ownerId }),
    ...(exerciseIds.length
      ? [d.insert(schema.stationExercises).values(exerciseIds.map((exerciseId) => ({ stationId: id, exerciseId })))]
      : []),
  ] as unknown as Parameters<typeof d.batch>[0]);
  return id;
}

/** `date` (YYYY-MM-DD) plus `n` days. */
function plusDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
