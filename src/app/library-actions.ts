"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";

import type { ActionResult } from "@/lib/action-result";
import {
  createEquipment,
  deleteEquipment,
  renameEquipment,
} from "@/lib/data/equipment";
import {
  createConfiguration,
  deleteConfiguration,
  moveConfiguration,
  prepareEquipmentImageUpload,
  registerEquipmentImage,
  removeEquipmentImage,
  setDefaultConfiguration,
  updateConfiguration,
} from "@/lib/data/equipment-configurations";
import { UserError } from "@/lib/data/errors";
import {
  checkHallImage,
  createHall,
  deleteHall,
  prepareHallImageUpload,
  saveHall,
} from "@/lib/data/halls";
import {
  copyExercise,
  createExercise,
  deleteExercise,
  updateExercise,
} from "@/lib/data/exercises";
import { errorKey } from "@/lib/data/schemas";
import {
  copyStation,
  createStation,
  deleteStation,
  updateMyStationLinks,
  updateStation,
} from "@/lib/data/stations";
import {
  approveSubmission,
  makeGlobal,
  rejectSubmission,
  submitForReview,
  withdrawSubmission,
  type LibraryKind,
} from "@/lib/data/submissions";

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

/** Creates a station; `scope` "global" is refused for non-administrators. */
export async function createStationAction(
  name: string,
  scope: unknown = "personal",
): Promise<ActionResult> {
  let stationId: string | undefined;
  const result = await run(async () => {
    stationId = (await createStation({ name, scope })).id;
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

/** Creates an exercise; `scope` "global" is refused for non-administrators. */
export async function createExerciseAction(
  name: string,
  scope: unknown = "personal",
): Promise<ActionResult> {
  let exerciseId: string | undefined;
  const result = await run(async () => {
    exerciseId = (await createExercise({ name, scope })).id;
    return {};
  });
  if (exerciseId) {
    redirect(`/library/exercises/${exerciseId}`);
  }
  return result;
}

/**
 * Creates an exercise without leaving the page, for adding a new exercise to
 * a station while editing it, or to an activity in the session editor. With
 * `stationId` the station also supports it when the user may edit the
 * station. Returns the new exercise.
 */
export async function createExerciseInlineAction(
  name: string,
  stationId: string | null = null,
): Promise<Result<{ exercise: { id: string; name: string } }>> {
  return run(async () => ({ exercise: await createExercise({ name, stationId }) }), {
    refreshPage: false,
  });
}

/** Creates a personal station without leaving the page, for the session editor. */
export async function createStationInlineAction(
  name: string,
): Promise<Result<{ station: { id: string; name: string } }>> {
  return run(async () => ({ station: await createStation({ name }) }), {
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

// --- Global items and review ------------------------------------------------------

const kindInput = z.enum(["station", "exercise"], { error: "invalid" });

function itemPath(kind: LibraryKind, itemId: string): string {
  return kind === "station" ? `/library/stations/${itemId}` : `/library/exercises/${itemId}`;
}

/**
 * Saves which of the user's own exercises a station supports, for a coach
 * adding their personal exercises to a global station. Other links stay.
 */
export async function updateMyStationLinksAction(
  stationId: string,
  exerciseIds: unknown,
): Promise<ActionResult> {
  return run(async () => {
    await updateMyStationLinks(stationId, exerciseIds);
    return {};
  });
}

/** Copies a global station or exercise into a personal one and opens the copy. */
export async function copyToMineAction(kind: unknown, itemId: string): Promise<ActionResult> {
  let path: string | undefined;
  const result = await run(async () => {
    const k = kindInput.parse(kind);
    const { id } = k === "station" ? await copyStation(itemId) : await copyExercise(itemId);
    path = itemPath(k, id);
    return {};
  });
  if (path) {
    redirect(path);
  }
  return result;
}

/**
 * Submits the user's personal station or exercise for review. For a station,
 * `exerciseIds` are the user's own personal exercises it supports that go with it.
 */
export async function submitForReviewAction(
  kind: unknown,
  itemId: string,
  exerciseIds: unknown = [],
): Promise<ActionResult> {
  return run(async () => {
    await submitForReview(kindInput.parse(kind), itemId, exerciseIds);
    return {};
  });
}

/** Withdraws the user's pending submission of a station or exercise. */
export async function withdrawSubmissionAction(
  kind: unknown,
  itemId: string,
): Promise<ActionResult> {
  return run(async () => {
    await withdrawSubmission(kindInput.parse(kind), itemId);
    return {};
  });
}

/**
 * Turns an administrator's own personal item global without review, for a
 * station with the ticked own personal exercises it supports.
 */
export async function makeGlobalAction(
  kind: unknown,
  itemId: string,
  exerciseIds: unknown = [],
): Promise<ActionResult> {
  return run(async () => {
    await makeGlobal(kindInput.parse(kind), itemId, exerciseIds);
    return {};
  });
}

/**
 * Approves a pending submission: the item becomes global, for a station with
 * the ticked included exercises that still qualify. Administrators only.
 */
export async function approveSubmissionAction(
  submissionId: string,
  exerciseIds: unknown = [],
): Promise<ActionResult> {
  return run(async () => {
    await approveSubmission(submissionId, exerciseIds);
    return {};
  });
}

/** Rejects a pending submission with a required comment. Administrators only. */
export async function rejectSubmissionAction(
  submissionId: string,
  comment: string,
): Promise<ActionResult> {
  return run(async () => {
    await rejectSubmission(submissionId, comment);
    return {};
  });
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

// --- Equipment configurations -----------------------------------------------------
// See src/lib/data/equipment-configurations.ts. Administrators only.

export async function createConfigurationAction(
  equipmentId: string,
  input: unknown,
): Promise<ActionResult> {
  return run(async () => {
    await createConfiguration(equipmentId, input);
    return {};
  });
}

export async function updateConfigurationAction(
  configurationId: string,
  input: unknown,
): Promise<ActionResult> {
  return run(async () => {
    await updateConfiguration(configurationId, input);
    return {};
  });
}

export async function moveConfigurationAction(
  configurationId: string,
  direction: unknown,
): Promise<ActionResult> {
  return run(async () => {
    await moveConfiguration(configurationId, direction);
    return {};
  });
}

export async function setDefaultConfigurationAction(configurationId: string): Promise<ActionResult> {
  return run(async () => {
    await setDefaultConfiguration(configurationId);
    return {};
  });
}

export async function deleteConfigurationAction(configurationId: string): Promise<ActionResult> {
  return run(async () => {
    await deleteConfiguration(configurationId);
    return {};
  });
}

/** Step 1 of an image upload: checks the file and returns the path to upload to. */
export async function prepareEquipmentImageUploadAction(
  configurationId: string,
  file: { name: string; type: string; size: number },
): Promise<Result<{ pathname: string }>> {
  return run(() => prepareEquipmentImageUpload(configurationId, file), { refreshPage: false });
}

/** Step 3 of an image upload: checks the stored file and gives it to the configuration. */
export async function registerEquipmentImageAction(
  configurationId: string,
  input: { pathname: string },
): Promise<ActionResult> {
  return run(async () => {
    await registerEquipmentImage(configurationId, input);
    return {};
  });
}

export async function removeEquipmentImageAction(configurationId: string): Promise<ActionResult> {
  return run(async () => {
    await removeEquipmentImage(configurationId);
    return {};
  });
}

// --- Halls --------------------------------------------------------------------------
// See src/lib/data/halls.ts. Everyone reads halls; administrators change them.

/** Creates a hall and opens it in the editor. */
export async function createHallAction(input: unknown): Promise<ActionResult> {
  let hallId: string | undefined;
  const result = await run(async () => {
    hallId = await createHall(input);
    return {};
  });
  if (hallId) {
    redirect(`/library/halls/${hallId}`);
  }
  return result;
}

/** Saves a whole hall: name, size and features. */
export async function saveHallAction(hallId: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    await saveHall(hallId, input);
    return {};
  });
}

export async function deleteHallAction(hallId: string): Promise<void> {
  await deleteHall(hallId);
  redirect("/library/halls");
}

/** Step 1 of a feature image upload: checks the file and returns the path to upload to. */
export async function prepareHallImageUploadAction(
  hallId: string,
  file: { name: string; type: string; size: number },
): Promise<Result<{ pathname: string }>> {
  return run(() => prepareHallImageUpload(hallId, file), { refreshPage: false });
}

/** Step 3 of a feature image upload: checks the stored file; returns the URL to show it with. */
export async function checkHallImageAction(
  hallId: string,
  input: { pathname: string },
): Promise<Result<{ url: string }>> {
  return run(() => checkHallImage(hallId, input), { refreshPage: false });
}
