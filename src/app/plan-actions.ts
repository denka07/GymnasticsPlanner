"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  createGroup,
  deleteGroup,
  renameGroup,
} from "@/lib/data/groups";
import { saveFocusAllocations } from "@/lib/data/allocations";
import { errorKey } from "@/lib/data/schemas";
import {
  createSeason,
  deleteSeason,
  updateSeason,
} from "@/lib/data/seasons";
import {
  createDiscipline,
  createFocusItem,
  deleteDiscipline,
  deleteFocusItem,
  moveDiscipline,
  moveFocusItem,
  moveFocusItemToDiscipline,
  renameDiscipline,
  updateFocusItem,
} from "@/lib/data/structure";
import { saveSeasonWeek } from "@/lib/data/weeks";
import type { Direction } from "@/lib/reorder";

/*
 * Thin wrappers around src/lib/data. Every data function checks access and
 * validates its input itself; these only turn validation errors into a
 * result the form can show, and refresh or redirect afterwards.
 */

async function run(work: () => Promise<void>): Promise<ActionResult> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: errorKey(error) };
    }
    // notFound() and redirect() are thrown too; let Next.js handle them.
    throw error;
  }
  refresh();
  return { ok: true };
}

// --- Groups --------------------------------------------------------------

export async function createGroupAction(name: string): Promise<ActionResult> {
  let groupId: string | undefined;
  const result = await run(async () => {
    groupId = await createGroup({ name });
  });
  if (groupId) {
    redirect(`/groups/${groupId}`);
  }
  return result;
}

export async function renameGroupAction(
  groupId: string,
  name: string,
): Promise<ActionResult> {
  return run(() => renameGroup(groupId, { name }));
}

export async function deleteGroupAction(groupId: string): Promise<void> {
  await deleteGroup(groupId);
  redirect("/");
}

// --- Seasons -------------------------------------------------------------

export async function createSeasonAction(
  groupId: string,
  input: unknown,
): Promise<ActionResult> {
  let seasonId: string | undefined;
  const result = await run(async () => {
    seasonId = await createSeason(groupId, input);
  });
  if (seasonId) {
    redirect(`/seasons/${seasonId}/setup`);
  }
  return result;
}

export async function updateSeasonAction(
  seasonId: string,
  input: unknown,
): Promise<ActionResult> {
  return run(() => updateSeason(seasonId, input));
}

export async function deleteSeasonAction(seasonId: string): Promise<void> {
  const groupId = await deleteSeason(seasonId);
  redirect(`/groups/${groupId}`);
}

// --- Disciplines ---------------------------------------------------------

export async function createDisciplineAction(
  seasonId: string,
  name: string,
): Promise<ActionResult> {
  return run(async () => {
    await createDiscipline(seasonId, { name });
  });
}

export async function renameDisciplineAction(
  disciplineId: string,
  name: string,
): Promise<ActionResult> {
  return run(() => renameDiscipline(disciplineId, { name }));
}

export async function moveDisciplineAction(
  disciplineId: string,
  direction: Direction,
): Promise<ActionResult> {
  return run(() => moveDiscipline(disciplineId, direction));
}

export async function deleteDisciplineAction(
  disciplineId: string,
): Promise<ActionResult> {
  return run(() => deleteDiscipline(disciplineId));
}

// --- Focus items ---------------------------------------------------------

export async function createFocusItemAction(
  disciplineId: string,
  input: { name: string; category: string },
): Promise<ActionResult> {
  return run(async () => {
    await createFocusItem(disciplineId, input);
  });
}

export async function updateFocusItemAction(
  focusItemId: string,
  input: { name: string; category: string },
): Promise<ActionResult> {
  return run(() => updateFocusItem(focusItemId, input));
}

export async function moveFocusItemAction(
  focusItemId: string,
  direction: Direction,
): Promise<ActionResult> {
  return run(() => moveFocusItem(focusItemId, direction));
}

export async function moveFocusItemToDisciplineAction(
  focusItemId: string,
  disciplineId: string,
): Promise<ActionResult> {
  return run(() => moveFocusItemToDiscipline(focusItemId, disciplineId));
}

export async function deleteFocusItemAction(
  focusItemId: string,
): Promise<ActionResult> {
  return run(() => deleteFocusItem(focusItemId));
}

// --- Focus allocations ---------------------------------------------------

/**
 * Saves cell changes of the season plan grid. Does not refresh the page: the
 * grid already shows the changes, and re-rendering it on every stroke would
 * only cost time.
 */
export async function saveFocusAllocationsAction(
  seasonId: string,
  changes: unknown,
): Promise<ActionResult> {
  try {
    await saveFocusAllocations(seasonId, changes);
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: errorKey(error) };
    }
    throw error;
  }
  return { ok: true };
}

// --- Week settings -------------------------------------------------------

/** Saves the break flag and note of one week of the season plan. */
export async function saveSeasonWeekAction(
  seasonId: string,
  input: unknown,
): Promise<ActionResult> {
  return run(() => saveSeasonWeek(seasonId, input));
}
