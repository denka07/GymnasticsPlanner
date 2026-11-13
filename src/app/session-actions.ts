"use server";

import { refresh } from "next/cache";
import { ZodError } from "zod";

import { errorKey } from "@/lib/data/schemas";
import {
  copySessionContent,
  createExtraSession,
  deleteSession,
  saveSessionOutline,
  setSessionCancelled,
  updateSessionDetails,
} from "@/lib/data/sessions";
import { resetTicks, setNoteAfter, setPartDone } from "@/lib/data/session-view";
import type { SavedPart } from "@/lib/outline";

/*
 * Thin wrappers around src/lib/data/sessions.ts, like plan-actions.ts. A
 * `target` is a stored session ({ sessionId }) or a training slot's
 * placeholder in a week ({ seasonId, trainingSlotId, weekStart }); editing a
 * placeholder stores it, and the result carries the session id.
 */

export type SessionActionResult<T = object> =
  | ({ ok: true; sessionId: string } & T)
  | { ok: false; error: string };

async function run<T extends { sessionId: string }>(
  work: () => Promise<T>,
  { refreshPage }: { refreshPage: boolean },
): Promise<SessionActionResult<Omit<T, "sessionId">>> {
  let value: T;
  try {
    value = await work();
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: errorKey(error) };
    }
    // notFound() is thrown too; let Next.js handle it.
    throw error;
  }
  if (refreshPage) {
    refresh();
  }
  return { ok: true, ...value };
}

export async function updateSessionDetailsAction(
  target: unknown,
  input: unknown,
): Promise<SessionActionResult> {
  return run(async () => ({ sessionId: await updateSessionDetails(target, input) }), {
    refreshPage: true,
  });
}

export async function setSessionCancelledAction(
  target: unknown,
  cancelled: boolean,
): Promise<SessionActionResult> {
  return run(async () => ({ sessionId: await setSessionCancelled(target, cancelled) }), {
    refreshPage: true,
  });
}

export async function createExtraSessionAction(
  seasonId: string,
  input: unknown,
): Promise<SessionActionResult> {
  return run(async () => ({ sessionId: await createExtraSession(seasonId, input) }), {
    refreshPage: true,
  });
}

export async function deleteSessionAction(sessionId: string): Promise<SessionActionResult> {
  return run(
    async () => {
      await deleteSession(sessionId);
      return { sessionId };
    },
    { refreshPage: true },
  );
}

/**
 * Saves a session's whole outline. Does not refresh the page: the editor
 * already shows the outline, and re-rendering on every pause in typing would
 * only cost time.
 */
export async function saveSessionOutlineAction(
  target: unknown,
  outline: unknown,
): Promise<SessionActionResult> {
  return run(async () => ({ sessionId: await saveSessionOutline(target, outline) }), {
    refreshPage: false,
  });
}

/** Replaces the target's outline with a copy of the source's. */
export async function copySessionContentAction(
  sourceSessionId: string,
  target: unknown,
): Promise<SessionActionResult<{ parts: SavedPart[] }>> {
  return run(() => copySessionContent(sourceSessionId, target), { refreshPage: true });
}

// --- Session page ---------------------------------------------------------------
// None of these refresh the page: the page already holds the state it shows.

/** Ticks or unticks one part of a session. */
export async function setPartDoneAction(
  sessionId: string,
  partId: string,
  done: boolean,
): Promise<SessionActionResult> {
  return run(
    async () => {
      await setPartDone({ sessionId, partId, done });
      return { sessionId };
    },
    { refreshPage: false },
  );
}

export async function resetTicksAction(sessionId: string): Promise<SessionActionResult> {
  return run(
    async () => {
      await resetTicks(sessionId);
      return { sessionId };
    },
    { refreshPage: false },
  );
}

export async function setNoteAfterAction(
  sessionId: string,
  note: string,
): Promise<SessionActionResult> {
  return run(
    async () => {
      await setNoteAfter(sessionId, note);
      return { sessionId };
    },
    { refreshPage: false },
  );
}
