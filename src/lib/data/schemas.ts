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
  type WeekInput,
} from "../season-weeks";
import {
  MAX_ACTIVITIES_PER_PART,
  MAX_ACTIVITY_LENGTH,
  MAX_DURATION,
  MAX_EXERCISES_PER_ACTIVITY,
  MAX_PARTS,
  MAX_TITLE_LENGTH,
  MIN_DURATION,
} from "../outline";
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

/**
 * The Mondays of a season first and last week, or null (after reporting an
 * issue) when the last week is before the first or the season is too long.
 */
function mondayRange(
  s: { firstWeek: WeekInput; lastWeek: WeekInput },
  ctx: z.RefinementCtx,
): { firstWeek: string; lastWeek: string } | null {
  const firstMonday = weekInputToMonday(s.firstWeek);
  const lastMonday = weekInputToMonday(s.lastWeek);
  if (lastMonday < firstMonday) {
    ctx.addIssue({ code: "custom", message: "weekOrder", path: ["lastWeek"] });
    return null;
  }
  if (weekCount(firstMonday, lastMonday) > MAX_SEASON_WEEKS) {
    ctx.addIssue({ code: "custom", message: "tooManyWeeks", path: ["lastWeek"] });
    return null;
  }
  return { firstWeek: firstMonday, lastWeek: lastMonday };
}

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
    const range = mondayRange(s, ctx);
    if (range === null) {
      return z.NEVER;
    }
    return {
      name: s.name,
      ...range,
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

// --- Copying a season -----------------------------------------------------

/**
 * Where and how to copy a season: the name, weeks and group of the copy, and
 * whether the focus allocations come along. The weeks follow the same rules
 * as when creating a season.
 */
export const copySeasonInput = z
  .object({
    name,
    firstWeek: weekInput.refine(isValidIsoWeek, { error: "invalidWeek" }),
    lastWeek: weekInput.refine(isValidIsoWeek, { error: "invalidWeek" }),
    groupId: id,
    includeAllocations: z.boolean({ error: "invalid" }),
  })
  .transform((s, ctx) => {
    const range = mondayRange(s, ctx);
    if (range === null) {
      return z.NEVER;
    }
    return {
      name: s.name,
      ...range,
      groupId: s.groupId,
      includeAllocations: s.includeAllocations,
    };
  });

export type CopySeasonInput = z.input<typeof copySeasonInput>;
export type CopySeasonValues = z.output<typeof copySeasonInput>;

// --- Sessions -------------------------------------------------------------

/** Where a session edit goes: a stored session, or a slot's placeholder in a week. */
export const sessionTargetInput = z.union(
  [
    z.object({ sessionId: id }).strict(),
    z
      .object({ seasonId: id, trainingSlotId: id, weekStart })
      .strict(),
  ],
  { error: "invalid" },
);

export type SessionTarget = z.input<typeof sessionTargetInput>;

/** Date, times and location of a session. */
export const sessionDetailsInput = z
  .object({
    date: isoDate,
    startTime: time,
    endTime: time,
    location: optionalText(100),
  })
  .refine((s) => !s.startTime || !s.endTime || s.endTime > s.startTime, {
    error: "timeOrder",
    path: ["endTime"],
  });

export type SessionDetailsInput = z.input<typeof sessionDetailsInput>;
export type SessionDetails = z.output<typeof sessionDetailsInput>;

const durationInput = z
  .number({ error: "invalidDuration" })
  .int({ error: "invalidDuration" })
  .min(MIN_DURATION, { error: "invalidDuration" })
  .max(MAX_DURATION, { error: "invalidDuration" })
  .nullable();

/**
 * One activity: optional station, exercises in order (each once) and
 * optional text; it needs exercises or text.
 */
const activityInput = z
  .object({
    id,
    text: z
      .string({ error: "invalid" })
      .trim()
      .max(MAX_ACTIVITY_LENGTH, { error: "textTooLong" })
      .default(""),
    stationId: id.nullable().default(null),
    exerciseIds: z
      .array(id, { error: "invalid" })
      .max(MAX_EXERCISES_PER_ACTIVITY, { error: "tooManyExercises" })
      .refine((ids) => new Set(ids).size === ids.length, { error: "invalid" })
      .default([]),
  })
  .refine((a) => a.text !== "" || a.exerciseIds.length > 0, { error: "activityEmpty" });

const partInput = z.object({
  id,
  title: z.string({ error: "invalid" }).trim().max(MAX_TITLE_LENGTH, { error: "textTooLong" }),
  durationMinutes: durationInput,
  activities: z
    .array(activityInput, { error: "invalid" })
    .max(MAX_ACTIVITIES_PER_PART, { error: "tooManyActivities" }),
});

/**
 * The whole outline of a session: parts in order, each with its activities in
 * order. Ids are made by the client for new lines; every id appears once.
 */
export const outlineInput = z
  .array(partInput, { error: "invalid" })
  .max(MAX_PARTS, { error: "tooManyParts" })
  .superRefine((parts, ctx) => {
    const seen = new Set<string>();
    for (const p of parts) {
      for (const lineId of [p.id, ...p.activities.map((a) => a.id)]) {
        if (seen.has(lineId)) {
          ctx.addIssue({ code: "custom", message: "invalid", path: [] });
          return;
        }
        seen.add(lineId);
      }
    }
  });

export type OutlineInput = z.output<typeof outlineInput>;

// --- Session page: ticks and note -------------------------------------------

/** One tick on the session page: a part or an activity, done or not. */
export const tickInput = z.object(
  {
    sessionId: id,
    partId: id,
    done: z.boolean({ error: "invalid" }),
  },
  { error: "invalid" },
);

export type TickInput = z.input<typeof tickInput>;

export const MAX_NOTE_AFTER_LENGTH = 5000;

/** The note after a session; empty text clears it. */
export const noteAfterInput = z
  .string({ error: "invalid" })
  .max(MAX_NOTE_AFTER_LENGTH, { error: "textTooLong" })
  .transform((v) => (v.trim() === "" ? null : v));

// --- Library ------------------------------------------------------------------

export const MAX_LIBRARY_DESCRIPTION_LENGTH = 2000;
export const MAX_VARIANT_LENGTH = 1000;
export const MAX_FOCUS_CUES = 20;
export const MAX_FOCUS_CUE_LENGTH = 100;
export const MAX_STATION_EQUIPMENT = 30;
export const MAX_EQUIPMENT_QUANTITY = 99;
export const MAX_LINKS = 200;

/** A list search text; anything else than a string means no search. */
export const searchInput = z
  .unknown()
  .transform((v) => (typeof v === "string" ? v.trim().slice(0, 100) : ""));

/** Distinct ids; duplicates are dropped. */
export const idList = z
  .array(id, { error: "invalid" })
  .max(MAX_LINKS, { error: "invalid" })
  .transform((ids) => [...new Set(ids.map((v) => v.toLowerCase()))]);

/** Focus cues in order; blank cues are dropped. */
export const focusCuesInput = z
  .array(
    z.string({ error: "invalid" }).trim().max(MAX_FOCUS_CUE_LENGTH, { error: "cueTooLong" }),
    { error: "invalid" },
  )
  .transform((cues) => cues.filter((c) => c !== ""))
  .refine((cues) => cues.length <= MAX_FOCUS_CUES, { error: "tooManyCues" });

export const exerciseInput = z.object(
  {
    name,
    description: optionalText(MAX_LIBRARY_DESCRIPTION_LENGTH),
    focusCues: focusCuesInput,
    easierVariant: optionalText(MAX_VARIANT_LENGTH),
    harderVariant: optionalText(MAX_VARIANT_LENGTH),
    disciplineName: optionalText(100),
    /** Every station that supports the exercise, among those the user may see. */
    stationIds: idList,
  },
  { error: "invalid" },
);

export type ExerciseInput = z.input<typeof exerciseInput>;
export type ExerciseValues = z.output<typeof exerciseInput>;

const equipmentLineInput = z.object(
  {
    equipmentId: id,
    quantity: z
      .number({ error: "invalidQuantity" })
      .int({ error: "invalidQuantity" })
      .min(1, { error: "invalidQuantity" })
      .max(MAX_EQUIPMENT_QUANTITY, { error: "invalidQuantity" }),
  },
  { error: "invalid" },
);

export const stationInput = z.object(
  {
    name,
    description: optionalText(MAX_LIBRARY_DESCRIPTION_LENGTH),
    /** Needed equipment in display order; each entry at most once. */
    equipment: z
      .array(equipmentLineInput, { error: "invalid" })
      .max(MAX_STATION_EQUIPMENT, { error: "tooManyEquipmentLines" })
      .refine(
        (lines) =>
          new Set(lines.map((l) => l.equipmentId.toLowerCase())).size === lines.length,
        { error: "duplicateEquipment" },
      ),
    /** Every supported exercise, among those the user may see. */
    exerciseIds: idList,
  },
  { error: "invalid" },
);

export type StationInput = z.input<typeof stationInput>;
export type StationValues = z.output<typeof stationInput>;
