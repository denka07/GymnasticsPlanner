import { describe, expect, it } from "vitest";

import { formatDayMonth, shortTime, weekdayOf } from "./dates";

describe("dates", () => {
  it("formats day and month in Swedish", () => {
    expect(formatDayMonth("2026-09-02")).toMatch(/^2 sep/);
  });
  it("gives the ISO weekday", () => {
    expect(weekdayOf("2026-08-31")).toBe(1);
    expect(weekdayOf("2026-09-06")).toBe(7);
  });
  it("shortens times", () => {
    expect(shortTime("17:00:00")).toBe("17:00");
    expect(shortTime(null)).toBeNull();
  });
});
