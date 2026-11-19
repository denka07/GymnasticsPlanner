"use server";

import { refresh } from "next/cache";
import { ZodError } from "zod";

import { errorKey } from "@/lib/data/schemas";
import {
  createPlan,
  deletePlan,
  savePlanItems,
  setSessionHall,
  updatePlanSettings,
} from "@/lib/data/session-plans";
import { resolveForEdit } from "@/lib/data/sessions";

/*
 * Thin wrappers around src/lib/data/session-plans.ts, like session-actions.ts.
 * Every data function checks access and validates its input itself.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function run<T extends object>(work: () => Promise<T>, refreshPage = true): Promise<Result<T>> {
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

/** Stores a training slot's placeholder if needed and returns the session to draw plans for. */
export async function openPlansAction(target: unknown): Promise<Result<{ sessionId: string }>> {
  return run(async () => ({ sessionId: (await resolveForEdit(target)).sessionId }), false);
}

export async function createPlanAction(sessionId: string, input: unknown): Promise<Result<{ planId: string }>> {
  return run(async () => ({ planId: await createPlan(sessionId, input) }));
}

export async function updatePlanSettingsAction(planId: string, input: unknown): Promise<Result> {
  return run(async () => {
    await updatePlanSettings(planId, input);
    return {};
  });
}

export async function deletePlanAction(planId: string): Promise<Result> {
  return run(async () => {
    await deletePlan(planId);
    return {};
  });
}

export async function savePlanItemsAction(planId: string, items: unknown): Promise<Result> {
  return run(async () => {
    await savePlanItems(planId, items);
    return {};
  });
}

export async function setSessionHallAction(sessionId: string, hallId: string): Promise<Result> {
  return run(async () => {
    await setSessionHall(sessionId, hallId);
    return {};
  });
}
