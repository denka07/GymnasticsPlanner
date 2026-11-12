import "server-only";

import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { getDb } from "@/db";
import { events } from "@/db/schema";
import { requireSeasonAccess } from "@/lib/access";

import { eventInput, id } from "./schemas";

/* Events of a season: competitions, camps, shows and so on. */

/** Creates an event in a season and returns its id. Requires edit access. */
export async function createEvent(seasonId: string, input: unknown): Promise<string> {
  await requireSeasonAccess(seasonId, "edit");
  const values = eventInput.parse(input);
  const [row] = await getDb()
    .insert(events)
    .values({ seasonId, ...values })
    .returning({ id: events.id });
  return row.id;
}

/** The season an event belongs to; calls notFound() for an unknown event. */
async function seasonOfEvent(eventId: string): Promise<string> {
  if (!id.safeParse(eventId).success) {
    notFound();
  }
  const [row] = await getDb()
    .select({ seasonId: events.seasonId })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!row) {
    notFound();
  }
  return row.seasonId;
}

/** Updates an event. Requires edit access to its season. */
export async function updateEvent(eventId: string, input: unknown): Promise<void> {
  await requireSeasonAccess(await seasonOfEvent(eventId), "edit");
  const values = eventInput.parse(input);
  await getDb().update(events).set(values).where(eq(events.id, eventId));
}

/** Deletes an event. Requires edit access to its season. */
export async function deleteEvent(eventId: string): Promise<void> {
  await requireSeasonAccess(await seasonOfEvent(eventId), "edit");
  await getDb().delete(events).where(eq(events.id, eventId));
}
