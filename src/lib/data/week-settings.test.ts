import { describe, expect, it } from "vitest";

import { MAX_WEEK_NOTE_LENGTH, weekNeedsRow, weekSettingsInput } from "./schemas";

const schema = weekSettingsInput("2026-08-17", "2026-12-07");

describe("weekSettingsInput", () => {
  it("accepts a Monday within the season", () => {
    expect(schema.parse({ weekStart: "2026-11-02", isBreak: true, note: " Höstlov " })).toEqual({
      weekStart: "2026-11-02",
      isBreak: true,
      note: "Höstlov",
    });
  });

  it("turns an empty note into null", () => {
    expect(schema.parse({ weekStart: "2026-11-02", isBreak: false, note: "  " }).note).toBeNull();
  });

  it("accepts the first and last week", () => {
    expect(schema.safeParse({ weekStart: "2026-08-17", isBreak: false, note: null }).success).toBe(true);
    expect(schema.safeParse({ weekStart: "2026-12-07", isBreak: false, note: null }).success).toBe(true);
  });

  it("rejects a date that is not a Monday", () => {
    expect(schema.safeParse({ weekStart: "2026-11-03", isBreak: true, note: null }).success).toBe(false);
  });

  it("rejects a week outside the season", () => {
    const result = schema.safeParse({ weekStart: "2026-12-14", isBreak: true, note: null });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe("weekOutsideSeason");
  });

  it("rejects an impossible date and a long note", () => {
    expect(schema.safeParse({ weekStart: "2026-02-31", isBreak: true, note: null }).success).toBe(false);
    expect(
      schema.safeParse({
        weekStart: "2026-11-02",
        isBreak: false,
        note: "x".repeat(MAX_WEEK_NOTE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

describe("weekNeedsRow", () => {
  it("needs a row for a break or a note only", () => {
    expect(weekNeedsRow({ isBreak: true, note: null })).toBe(true);
    expect(weekNeedsRow({ isBreak: false, note: "x" })).toBe(true);
    expect(weekNeedsRow({ isBreak: false, note: null })).toBe(false);
  });
});
