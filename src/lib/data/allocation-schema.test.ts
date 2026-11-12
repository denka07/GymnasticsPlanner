import { describe, expect, it } from "vitest";

import { allocationChangesInput, errorKey, MAX_ALLOCATION_CHANGES } from "./schemas";

const schema = allocationChangesInput("2026-08-17", "2026-12-07");
const item = "3f1c2a4e-5b6d-4e7f-8a9b-0c1d2e3f4a5b";
const other = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

function keyOf(input: unknown): string {
  const result = schema.safeParse(input);
  if (result.success) {
    throw new Error("expected failure");
  }
  return errorKey(result.error);
}

describe("allocationChangesInput", () => {
  it("accepts levels and clears within the season", () => {
    const input = [
      { focusItemId: item, weekStart: "2026-08-17", level: "high" },
      { focusItemId: item, weekStart: "2026-12-07", level: null },
      { focusItemId: other, weekStart: "2026-09-07", level: "low" },
    ];
    expect(schema.parse(input)).toEqual(input);
  });

  it("rejects an empty list", () => {
    expect(keyOf([])).toBe("invalid");
  });

  it("rejects more than the maximum number of changes", () => {
    const many = Array.from({ length: MAX_ALLOCATION_CHANGES + 1 }, () => ({
      focusItemId: item,
      weekStart: "2026-08-17",
      level: "high",
    }));
    expect(keyOf(many)).toBe("tooManyChanges");
  });

  it("accepts exactly the maximum number of distinct changes", () => {
    const ids = Array.from({ length: 63 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    );
    const weeks = [
      "2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14",
      "2026-09-21", "2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19",
      "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23",
      "2026-11-30",
    ];
    const changes = ids
      .flatMap((id) => weeks.map((weekStart) => ({ focusItemId: id, weekStart, level: "medium" })))
      .slice(0, MAX_ALLOCATION_CHANGES);
    expect(changes).toHaveLength(MAX_ALLOCATION_CHANGES);
    expect(schema.safeParse(changes).success).toBe(true);
  });

  it("rejects weeks before or after the season", () => {
    expect(keyOf([{ focusItemId: item, weekStart: "2026-08-10", level: "high" }])).toBe(
      "weekOutsideSeason",
    );
    expect(keyOf([{ focusItemId: item, weekStart: "2026-12-14", level: "high" }])).toBe(
      "weekOutsideSeason",
    );
  });

  it("rejects days that are not Mondays and malformed dates", () => {
    expect(keyOf([{ focusItemId: item, weekStart: "2026-08-18", level: "high" }])).toBe("invalid");
    expect(keyOf([{ focusItemId: item, weekStart: "2026-02-30", level: "high" }])).toBe("invalid");
    expect(keyOf([{ focusItemId: item, weekStart: "17/8 2026", level: "high" }])).toBe("invalid");
  });

  it("rejects unknown levels and bad ids", () => {
    expect(keyOf([{ focusItemId: item, weekStart: "2026-08-17", level: "none" }])).toBe("invalid");
    expect(keyOf([{ focusItemId: "x", weekStart: "2026-08-17", level: "high" }])).toBe("invalid");
    expect(keyOf([{ focusItemId: item, weekStart: "2026-08-17" }])).toBe("invalid");
  });

  it("rejects the same cell twice", () => {
    expect(
      keyOf([
        { focusItemId: item, weekStart: "2026-08-17", level: "high" },
        { focusItemId: item, weekStart: "2026-08-17", level: null },
      ]),
    ).toBe("invalid");
  });

  it("rejects input that is not a list", () => {
    expect(keyOf({ focusItemId: item })).toBe("invalid");
  });
});
