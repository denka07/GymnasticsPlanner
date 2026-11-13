"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { ZodError } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  createEquipment,
  deleteEquipment,
  renameEquipment,
} from "@/lib/data/equipment";
import { UserError } from "@/lib/data/errors";
import {
  createExercise,
  deleteExercise,
  updateExercise,
} from "@/lib/data/exercises";
import { errorKey } from "@/lib/data/schemas";
import { createStation, deleteStation, updateStation } from "@/lib/data/stations";

/*
 * Thin wrappers around the library data layer, like plan-actions.ts. Every
 * data function checks access and validates its input itself; these turn
 * validation and user errors into a result the form can show.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(
  work: () => Promise<T>,
  { refreshPage = true }: { refreshPage?: boolean } = {},
): Promise<Result<T>> {
  let value: T;
  try {
    value = await work();
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: errorKey(error) };
    }
    if (error instanceof UserError) {
      return { ok: false, error: error.key };
    }
    // notFound() and redirect() are thrown too; let Next.js handle them.
    throw error;
  }
  if (refreshPage) {
    refresh();
  }
  return { ok: true, ...value };
}

// --- Stations -------------------------------------------------------------------

export async function createStationAction(name: string): Promise<ActionResult> {
  let stationId: string | undefined;
  const result = await run(async () => {
    stationId = await createStation({ name });
    return {};
  });
  if (stationId) {
    redirect(`/library/stations/${stationId}`);
  }
  return result;
}

export async function updateStationAction(
  stationId: string,
  input: unknown,
): Promise<ActionResult> {
  return run(async () => {
    await updateStation(stationId, input);
    return {};
  });
}

export async function deleteStationAction(stationId: string): Promise<void> {
  await deleteStation(stationId);
  redirect("/library/stations");
}

// --- Exercises ------------------------------------------------------------------

export async function createExerciseAction(name: string): Promise<ActionResult> {
  let exerciseId: string | undefined;
  const result = await run(async () => {
    exerciseId = (await createExercise({ name })).id;
    return {};
  });
  if (exerciseId) {
    redirect(`/library/exercises/${exerciseId}`);
  }
  return result;
}

/**
 * Creates an exercise without leaving the page, for adding a new exercise to
 * a station while editing it. Returns the new exercise.
 */
export async function createExerciseInlineAction(
  name: string,
): Promise<Result<{ exercise: { id: string; name: string } }>> {
  return run(async () => ({ exercise: await createExercise({ name }) }), {
    refreshPage: false,
  });
}

export async function updateExerciseAction(
  exerciseId: string,
  input: unknown,
): Promise<ActionResult> {
  return run(async () => {
    await updateExercise(exerciseId, input);
    return {};
  });
}

export async function deleteExerciseAction(exerciseId: string): Promise<void> {
  await deleteExercise(exerciseId);
  redirect("/library/exercises");
}

// --- Equipment ------------------------------------------------------------------

export async function createEquipmentAction(name: string): Promise<ActionResult> {
  return run(async () => {
    await createEquipment({ name });
    return {};
  });
}

export async function renameEquipmentAction(
  equipmentId: string,
  name: string,
): Promise<ActionResult> {
  return run(async () => {
    await renameEquipment(equipmentId, { name });
    return {};
  });
}

export async function deleteEquipmentAction(equipmentId: string): Promise<ActionResult> {
  return run(async () => {
    await deleteEquipment(equipmentId);
    return {};
  });
}
