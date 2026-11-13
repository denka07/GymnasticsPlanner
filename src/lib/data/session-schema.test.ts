import { describe, expect, it } from "vitest";

import { outlineInput, sessionDetailsInput, sessionTargetInput } from "./schemas";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function errorOf(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.success ? null : result.error!.issues[0].message;
}

describe("sessionTargetInput", () => {
  it("accepts a stored session or a slot placeholder", () => {
    expect(sessionTargetInput.safeParse({ sessionId: uuid(1) }).success).toBe(true);
    expect(
      sessionTargetInput.safeParse({ seasonId: uuid(1), trainingSlotId: uuid(2), weekStart: "2026-08-31" })
        .success,
    ).toBe(true);
  });
  it("rejects a placeholder whose week is not a Monday, and mixed shapes", () => {
    expect(
      sessionTargetInput.safeParse({ seasonId: uuid(1), trainingSlotId: uuid(2), weekStart: "2026-09-01" })
        .success,
    ).toBe(false);
    expect(sessionTargetInput.safeParse({ sessionId: uuid(1), seasonId: uuid(2) }).success).toBe(false);
    expect(sessionTargetInput.safeParse({ sessionId: "x" }).success).toBe(false);
  });
});

describe("sessionDetailsInput", () => {
  it("normalises empty values to null", () => {
    expect(
      sessionDetailsInput.parse({ date: "2026-09-02", startTime: "", endTime: null, location: "  " }),
    ).toEqual({ date: "2026-09-02", startTime: null, endTime: null, location: null });
  });
  it("checks date, time format and order", () => {
    expect(errorOf(sessionDetailsInput.safeParse({ date: "2026-02-30" }))).toBe("invalidDate");
    expect(errorOf(sessionDetailsInput.safeParse({ date: "2026-09-02", startTime: "25:00" }))).toBe(
      "invalidTime",
    );
    expect(
      errorOf(sessionDetailsInput.safeParse({ date: "2026-09-02", startTime: "18:00", endTime: "17:00" })),
    ).toBe("timeOrder");
  });
});

describe("outlineInput", () => {
  const part = (n: number, extra: object = {}) => ({
    id: uuid(n),
    title: `Del ${n}`,
    durationMinutes: null,
    activities: [],
    ...extra,
  });

  it("accepts an outline and trims text", () => {
    const parsed = outlineInput.parse([
      part(1, { title: " Samling ", durationMinutes: 10, activities: [{ id: uuid(2), text: " Volt " }] }),
    ]);
    expect(parsed).toEqual([
      {
        id: uuid(1),
        title: "Samling",
        durationMinutes: 10,
        activities: [{ id: uuid(2), text: "Volt", stationId: null, exerciseIds: [] }],
      },
    ]);
  });
  it("accepts linked activities, with or without text", () => {
    const linked = { id: uuid(2), stationId: uuid(3), exerciseIds: [uuid(4), uuid(5)] };
    const parsed = outlineInput.parse([part(1, { activities: [linked] })]);
    expect(parsed[0].activities[0]).toEqual({ ...linked, text: "" });
    expect(
      outlineInput.safeParse([part(1, { activities: [{ id: uuid(2), text: "x", stationId: uuid(3) }] })])
        .success,
    ).toBe(true);
  });
  it("needs exercises or text on an activity", () => {
    expect(
      errorOf(outlineInput.safeParse([part(1, { activities: [{ id: uuid(2), text: " ", stationId: uuid(3) }] })])),
    ).toBe("activityEmpty");
  });
  it("rejects repeated, invalid or too many exercises", () => {
    const act = (exerciseIds: unknown) => [part(1, { activities: [{ id: uuid(2), exerciseIds }] })];
    expect(outlineInput.safeParse(act([uuid(4), uuid(4)])).success).toBe(false);
    expect(outlineInput.safeParse(act(["nope"])).success).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) => uuid(100 + i));
    expect(errorOf(outlineInput.safeParse(act(many)))).toBe("tooManyExercises");
  });
  it("accepts an empty outline and an empty title", () => {
    expect(outlineInput.safeParse([]).success).toBe(true);
    expect(outlineInput.safeParse([part(1, { title: "" })]).success).toBe(true);
  });
  it("limits durations to 1–600 whole minutes", () => {
    expect(errorOf(outlineInput.safeParse([part(1, { durationMinutes: 0 })]))).toBe("invalidDuration");
    expect(errorOf(outlineInput.safeParse([part(1, { durationMinutes: 601 })]))).toBe("invalidDuration");
    expect(errorOf(outlineInput.safeParse([part(1, { durationMinutes: 1.5 })]))).toBe("invalidDuration");
    expect(outlineInput.safeParse([part(1, { durationMinutes: 600 })]).success).toBe(true);
  });
  it("limits counts and lengths", () => {
    const many = Array.from({ length: 61 }, (_, i) => part(i + 1));
    expect(errorOf(outlineInput.safeParse(many))).toBe("tooManyParts");
    const acts = Array.from({ length: 61 }, (_, i) => ({ id: uuid(100 + i), text: "x" }));
    expect(errorOf(outlineInput.safeParse([part(1, { activities: acts })]))).toBe("tooManyActivities");
    expect(errorOf(outlineInput.safeParse([part(1, { title: "x".repeat(301) })]))).toBe("textTooLong");
    expect(
      errorOf(outlineInput.safeParse([part(1, { activities: [{ id: uuid(2), text: "x".repeat(1001) }] })])),
    ).toBe("textTooLong");
  });
  it("rejects empty activities and repeated ids", () => {
    expect(outlineInput.safeParse([part(1, { activities: [{ id: uuid(2), text: " " }] })]).success).toBe(false);
    expect(
      outlineInput.safeParse([part(1, { activities: [{ id: uuid(1), text: "x" }] })]).success,
    ).toBe(false);
  });
});
