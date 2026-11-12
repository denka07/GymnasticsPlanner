import { describe, expect, it } from "vitest";

import {
  category,
  errorKey,
  focusItemInput,
  name,
  seasonInput,
  type SeasonInput,
} from "./schemas";

const valid: SeasonInput = {
  name: " 2026 HT ",
  firstWeek: { year: 2026, week: 34 },
  lastWeek: { year: 2026, week: 50 },
  trainingSlots: [
    { weekday: 7, startTime: "", endTime: "", location: "" },
    { weekday: 1, startTime: "17:00", endTime: "19:00", location: " Hallen " },
  ],
};

function keyOf(input: unknown): string {
  const result = seasonInput.safeParse(input);
  if (result.success) {
    throw new Error("expected failure");
  }
  return errorKey(result.error);
}

describe("name", () => {
  it("trims", () => {
    expect(name.parse("  Trupp 5 ")).toBe("Trupp 5");
  });

  it("rejects blank names", () => {
    const result = name.safeParse("   ");
    expect(result.success).toBe(false);
    expect(result.error && errorKey(result.error)).toBe("nameRequired");
  });

  it("rejects names over 100 characters", () => {
    const result = name.safeParse("x".repeat(101));
    expect(result.error && errorKey(result.error)).toBe("nameTooLong");
  });
});

describe("seasonInput", () => {
  it("stores weeks as Mondays and sorts slots by weekday", () => {
    expect(seasonInput.parse(valid)).toEqual({
      name: "2026 HT",
      firstWeek: "2026-08-17",
      lastWeek: "2026-12-07",
      trainingSlots: [
        { weekday: 1, startTime: "17:00", endTime: "19:00", location: "Hallen" },
        { weekday: 7, startTime: null, endTime: null, location: null },
      ],
    });
  });

  it("accepts a season that crosses the new year", () => {
    const parsed = seasonInput.parse({
      ...valid,
      firstWeek: { year: 2026, week: 50 },
      lastWeek: { year: 2027, week: 5 },
    });
    expect(parsed.firstWeek).toBe("2026-12-07");
    expect(parsed.lastWeek).toBe("2027-02-01");
  });

  it("accepts a single-week season", () => {
    const parsed = seasonInput.parse({ ...valid, lastWeek: valid.firstWeek });
    expect(parsed.lastWeek).toBe(parsed.firstWeek);
  });

  it("rejects a last week before the first", () => {
    expect(
      keyOf({ ...valid, firstWeek: { year: 2026, week: 50 }, lastWeek: { year: 2026, week: 34 } }),
    ).toBe("weekOrder");
  });

  it("accepts 60 weeks and rejects 61", () => {
    const first = { year: 2026, week: 1 };
    // 2026 has 53 weeks, so week 7 of 2027 is the 60th week.
    expect(
      seasonInput.safeParse({ ...valid, firstWeek: first, lastWeek: { year: 2027, week: 7 } })
        .success,
    ).toBe(true);
    expect(keyOf({ ...valid, firstWeek: first, lastWeek: { year: 2027, week: 8 } })).toBe(
      "tooManyWeeks",
    );
  });

  it("rejects a week number the year does not have", () => {
    expect(keyOf({ ...valid, lastWeek: { year: 2027, week: 53 } })).toBe("invalidWeek");
  });

  it("rejects a non-numeric week", () => {
    expect(keyOf({ ...valid, firstWeek: { year: 2026, week: Number.NaN } })).toBe(
      "invalidWeek",
    );
  });

  it("rejects the same weekday twice", () => {
    expect(
      keyOf({ ...valid, trainingSlots: [{ weekday: 1 }, { weekday: 1 }] }),
    ).toBe("duplicateWeekday");
  });

  it("rejects an end time before the start time", () => {
    expect(
      keyOf({
        ...valid,
        trainingSlots: [{ weekday: 1, startTime: "19:00", endTime: "17:00" }],
      }),
    ).toBe("timeOrder");
  });

  it("rejects a malformed time", () => {
    expect(
      keyOf({ ...valid, trainingSlots: [{ weekday: 1, startTime: "25:00" }] }),
    ).toBe("invalidTime");
  });

  it("rejects a weekday outside 1–7", () => {
    expect(seasonInput.safeParse({ ...valid, trainingSlots: [{ weekday: 8 }] }).success).toBe(
      false,
    );
  });

  it("allows a season without training slots", () => {
    expect(seasonInput.parse({ ...valid, trainingSlots: [] }).trainingSlots).toEqual([]);
  });
});

describe("focusItemInput", () => {
  it("trims the category and turns an empty one into null", () => {
    expect(focusItemInput.parse({ name: "Mjuk landning", category: "  " })).toEqual({
      name: "Mjuk landning",
      category: null,
    });
    expect(focusItemInput.parse({ name: "Trampett", category: " Redskap " })).toEqual({
      name: "Trampett",
      category: "Redskap",
    });
  });

  it("allows a missing category", () => {
    expect(focusItemInput.parse({ name: "Grunder" }).category).toBeNull();
  });

  it("rejects a category over 50 characters", () => {
    expect(category.safeParse("x".repeat(51)).success).toBe(false);
  });
});
