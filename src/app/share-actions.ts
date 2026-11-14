"use server";

import { refresh } from "next/cache";
import { ZodError } from "zod";

import type { ActionResult } from "@/lib/action-result";
import { errorKey } from "@/lib/data/schemas";
import {
  addShare,
  listShares,
  removeShare,
  updateShareLevel,
  type ShareEntry,
} from "@/lib/data/shares";

/*
 * Thin wrappers around src/lib/data/shares.ts. Every data function checks
 * that the current user owns the resource; these only turn validation errors
 * into a result the dialog can show.
 */

async function run(work: () => Promise<void>): Promise<ActionResult> {
  try {
    await work();
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: errorKey(error) };
    }
    // notFound() is thrown too; let Next.js handle it.
    throw error;
  }
  refresh();
  return { ok: true };
}

export async function listSharesAction(
  resource: unknown,
): Promise<{ ok: true; shares: ShareEntry[] } | { ok: false; error: string }> {
  try {
    return { ok: true, shares: await listShares(resource) };
  } catch (error) {
    if (error instanceof ZodError) {
      return { ok: false, error: errorKey(error) };
    }
    throw error;
  }
}

export async function addShareAction(resource: unknown, input: unknown): Promise<ActionResult> {
  return run(() => addShare(resource, input));
}

export async function updateShareLevelAction(shareId: string, level: string): Promise<ActionResult> {
  return run(() => updateShareLevel(shareId, level));
}

export async function removeShareAction(shareId: string): Promise<ActionResult> {
  return run(() => removeShare(shareId));
}
