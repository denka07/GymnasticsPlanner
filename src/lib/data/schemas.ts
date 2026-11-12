/**
 * Input validation for the data layer. Pure, so it can be unit-tested.
 *
 * Issue messages are keys in the `Errors` namespace of messages/sv.json, so
 * the interface can show them in Swedish.
 */
import { z } from "zod";

import {
  isValidIsoWeek,
  MAX_SEASON_WEEKS,
  weekCount,
  weekInputToMonday,
} from "../season-weeks";
import { isMonday } from "../weeks";

export const id = z.uuid({ error: "invalid" });

export const name = z
  .string({ error: "nameRequired" })
  .trim()
  .min(1, { error: "nameRequired" })
  .max(100, { error: "nameTooLong" });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: "textTooLong" })
    .nullish()
    .transform((v) => (v ? v : null));

const time = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^([01]\d|2[0-3]):[0-5]\d$/.test(v), {
    error: "invalidTime",
  });

export const trainingSlotInput = z
  .object({
    weekday: z.number().int().min(1).max(7),
    startTime: time,
    endTime: time,
    location: optionalText(100),
  })
  .refine(
    (s) => !s.startTime || !s.endTime || s.endTime > s.startTime,
    { error: "timeOrder", path: ["endTime"] },
  );

export type TrainingSlotInput = z.infer<typeof trainingSlotInput>;

const weekInput = z.object({
  year: z.number({ error: "invalidWeek" }).int({ error: "invalidWeek" }),
  week: z.number({ error: "invalidWeek" }).int({ error: "invalidWeek" }),
});

export const seasonInput = z
  .object({
    name,
    firstWeek: weekInput.refine(isValidIsoWeek, { error: "invalidWeek" }),
    lastWeek: weekInput.refine(isValidIsoWeek, { error: "invalidWeek" }),
    trainingSlots: z.array(trainingSlotInput).max(7),
  })
  .superRefine((s, ctx) => {
    const days = s.trainingSlots.map((slot) => slot.weekday);
    if (new Set(days).size !== days.length) {
      ctx.addIssue({ code: "custom", message: "duplicateWeekday", path: ["trainingSlots"] });
    }
  })
  .transform((s, ctx) => {
    const firstMonday = weekInputToMonday(s.firstWeek);
    const lastMonday = weekInputToMonday(s.lastWeek);
    if (lastMonday < firstMonday) {
      ctx.addIssue({ code: "custom", message: "weekOrder", path: ["lastWeek"] });
      return z.NEVER;
    }
    if (weekCount(firstMonday, lastMonday) > MAX_SEASON_WEEKS) {
      ctx.addIssue({ code: "custom", message: "tooManyWeeks", path: ["lastWeek"] });
      return z.NEVER;
    }
    return {
      name: s.name,
      firstWeek: firstMonday,
      lastWeek: lastMonday,
      trainingSlots: [...s.trainingSlots].sort((a, b) => a.weekday - b.weekday),
    };
  });

export type SeasonInput = z.input<typeof seasonInput>;
export type SeasonValues = z.output<typeof seasonInput>;

export const category = optionalText(50);

export const focusItemInput = z.object({ name, category });

export const direction = z.enum(["up", "down"]);

/** The first issue's message, as a key in the `Errors` namespace. */
export function errorKey(error: z.ZodError): string {
  return error.issues[0]?.message ?? "invalid";
}

// --- Focus allocations ---------------------------------------------------

/** Most cells one save may change. */
export const MAX_ALLOCATION_CHANGES = 1000;

export const focusLevelInput = z.enum(["high", "medium", "low"], {
  error: "invalid",
});

const weekStart = z
  .string({ error: "invalid" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalid" })
  .refine(
    (v) => {
      try {
        return isMonday(v);
      } catch {
        return false;
      }
    },
    { error: "invalid" },
  );

const allocationChange = z.object({
  focusItemId: id,
  weekStart,
  /** null clears the cell (not trained that week). */
  level: focusLevelInput.nullable(),
});

/**
 * A list of cell changes for one season whose weeks run from `firstWeek` to
 * `lastWeek` (both Mondays). Each cell may appear once. Whether the focus
 * items belong to the season is checked against the database separately.
 */
export function allocationChangesInput(firstWeek: string, lastWeek: string) {
  return z
    .array(allocationChange, { error: "invalid" })
    .min(1, { error: "invalid" })
    .max(MAX_ALLOCATION_CHANGES, { error: "tooManyChanges" })
    .superRefine((changes, ctx) => {
      const seen = new Set<string>();
      changes.forEach((change, index) => {
        if (change.weekStart < firstWeek || change.weekStart > lastWeek) {
          ctx.addIssue({
            code: "custom",
            message: "weekOutsideSeason",
            path: [index, "weekStart"],
          });
        }
        const key = `${change.focusItemId}|${change.weekStart}`;
        if (seen.has(key)) {
          ctx.addIssue({ code: "custom", message: "invalid", path: [index] });
        }
        seen.add(key);
      });
    });
}

export type AllocationChange = z.output<ReturnType<typeof allocationChangesInput>>[number];

// --- Week settings (break and note) --------------------------------------

/** Longest note on a week, in characters. */
export const MAX_WEEK_NOTE_LENGTH = 500;

/**
 * Break flag and note for one week of a season running from `firstWeek` to
 * `lastWeek` (both Mondays). `weekStart` must be a Monday within the season.
 */
export function weekSettingsInput(firstWeek: string, lastWeek: string) {
  return z
    .object({
      weekStart,
      isBreak: z.boolean({ error: "invalid" }),
      note: optionalText(MAX_WEEK_NOTE_LENGTH),
    })
    .superRefine((s, ctx) => {
      if (s.weekStart < firstWeek || s.weekStart > lastWeek) {
        ctx.addIssue({ code: "custom", message: "weekOutsideSeason", path: ["weekStart"] });
      }
    });
}

export type WeekSettings = z.output<ReturnType<typeof weekSettingsInput>>;

/** True when a week with these settings needs a row in season_weeks. */
export function weekNeedsRow(s: { isBreak: boolean; note: string | null }): boolean {
  return s.isBreak || s.note !== null;
}

// --- Events ---------------------------------------------------------------

export const eventTypeInput = z.enum(["competition", "camp", "show", "other"], {
  error: "invalid",
});

const isoDate = z
  .string({ error: "invalidDate" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "invalidDate" })
  .refine(
    (v) => {
      const d = new Date(`${v}T00:00:00Z`);
      return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    },
    { error: "invalidDate" },
  );

/** An event of a season. An empty end date means the same day as the start. */
export const eventInput = z
  .object({
    name,
    type: eventTypeInput,
    startDate: isoDate,
    endDate: z.union([isoDate, z.literal(""), z.null(), z.undefined()]),
  })
  .transform((e, ctx) => {
    const endDate = e.endDate || e.startDate;
    if (endDate < e.startDate) {
      ctx.addIssue({ code: "custom", message: "dateOrder", path: ["endDate"] });
      return z.NEVER;
    }
    return { name: e.name, type: e.type, startDate: e.startDate, endDate };
  });

export type EventInput = z.input<typeof eventInput>;
export type EventValues = z.output<typeof eventInput>;
