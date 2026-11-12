import { describe, expect, it } from "vitest";

import {
  addWeeks,
  isMonday,
  isoWeek,
  mondayOf,
  mondayOfIsoWeek,
  weekdayDate,
  weeksBetween,
} from "./weeks";

describe("mondayOf", () => {
  it("returns the same date for a Monday", () => {
    expect(mondayOf("2026-08-17")).toBe("2026-08-17");
  });
  it("goes back from a Sunday", () => {
    expect(mondayOf("2026-08-23")).toBe("2026-08-17");
  });
  it("crosses month and year boundaries", () => {
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(mondayOf("2026-03-01")).toBe("2026-02-23");
  });
  it("rejects invalid dates", () => {
    expect(() => mondayOf("2026-02-30")).toThrow();
    expect(() => mondayOf("nope")).toThrow();
  });
});

describe("isMonday", () => {
  it("tells Mondays from other days", () => {
    expect(isMonday("2026-08-17")).toBe(true);
    expect(isMonday("2026-08-18")).toBe(false);
    expect(isMonday("2026-08-23")).toBe(false);
  });
});

describe("isoWeek", () => {
  it("handles week 53 of 2026", () => {
    expect(isoWeek("2026-12-28")).toEqual({ year: 2026, week: 53 });
    expect(isoWeek("2027-01-03")).toEqual({ year: 2026, week: 53 });
  });
  it("starts 2027 at week 1 on 2027-01-04", () => {
    expect(isoWeek("2027-01-04")).toEqual({ year: 2027, week: 1 });
  });
  it("puts 2024-12-30 in week 1 of 2025", () => {
    expect(isoWeek("2024-12-30")).toEqual({ year: 2025, week: 1 });
  });
  it("puts early January in the previous year's last week", () => {
    expect(isoWeek("2021-01-01")).toEqual({ year: 2020, week: 53 });
  });
  it("numbers the start of the autumn season", () => {
    expect(isoWeek("2026-08-17")).toEqual({ year: 2026, week: 34 });
    expect(isoWeek("2026-12-07")).toEqual({ year: 2026, week: 50 });
  });
});

describe("mondayOfIsoWeek", () => {
  it("inverts isoWeek", () => {
    expect(mondayOfIsoWeek(2026, 34)).toBe("2026-08-17");
    expect(mondayOfIsoWeek(2026, 53)).toBe("2026-12-28");
    expect(mondayOfIsoWeek(2027, 1)).toBe("2027-01-04");
    expect(mondayOfIsoWeek(2025, 1)).toBe("2024-12-30");
  });
  it("round-trips every Monday over several years", () => {
    for (const monday of weeksBetween("2020-01-06", "2032-12-27")) {
      const { year, week } = isoWeek(monday);
      expect(mondayOfIsoWeek(year, week)).toBe(monday);
    }
  });
});

describe("addWeeks", () => {
  it("adds and subtracts whole weeks", () => {
    expect(addWeeks("2026-08-17", 1)).toBe("2026-08-24");
    expect(addWeeks("2026-08-17", -1)).toBe("2026-08-10");
    expect(addWeeks("2026-12-28", 1)).toBe("2027-01-04");
    expect(addWeeks("2026-08-17", 0)).toBe("2026-08-17");
  });
  it("is not affected by daylight saving changes", () => {
    expect(addWeeks("2026-10-19", 2)).toBe("2026-11-02");
    expect(addWeeks("2026-03-23", 1)).toBe("2026-03-30");
  });
});

describe("weeksBetween", () => {
  it("lists a season of weeks 34-50 of 2026", () => {
    const weeks = weeksBetween("2026-08-17", "2026-12-07");
    expect(weeks).toHaveLength(17);
    expect(weeks[0]).toBe("2026-08-17");
    expect(weeks[16]).toBe("2026-12-07");
    expect(weeks.map((w) => isoWeek(w).week)).toEqual(
      Array.from({ length: 17 }, (_, i) => 34 + i),
    );
  });
  it("returns one week when first equals last", () => {
    expect(weeksBetween("2026-08-17", "2026-08-17")).toEqual(["2026-08-17"]);
  });
  it("returns nothing when last is before first", () => {
    expect(weeksBetween("2026-08-24", "2026-08-17")).toEqual([]);
  });
  it("spans a year boundary", () => {
    expect(weeksBetween("2026-12-21", "2027-01-04")).toEqual([
      "2026-12-21",
      "2026-12-28",
      "2027-01-04",
    ]);
  });
});

describe("weekdayDate", () => {
  it("returns the date of a weekday in a week", () => {
    expect(weekdayDate("2026-08-17", 1)).toBe("2026-08-17");
    expect(weekdayDate("2026-08-17", 3)).toBe("2026-08-19");
    expect(weekdayDate("2026-08-17", 7)).toBe("2026-08-23");
    expect(weekdayDate("2026-12-28", 5)).toBe("2027-01-01");
  });
  it("rejects weekdays outside 1-7", () => {
    expect(() => weekdayDate("2026-08-17", 0)).toThrow();
    expect(() => weekdayDate("2026-08-17", 8)).toThrow();
  });
});
