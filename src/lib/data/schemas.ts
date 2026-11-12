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
