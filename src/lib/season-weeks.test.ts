import { describe, expect, it } from "vitest";

import {
  isValidIsoWeek,
  mondayToWeekInput,
  weekCount,
  weekInputToMonday,
} from "./season-weeks";

describe("weekInputToMonday", () => {
  it("converts week 34 of 2026 to its Monday", () => {
    expect(weekInputToMonday({ year: 2026, week: 34 })).toBe("2026-08-17");
  });

  it("converts week 50 of 2026 to its Monday", () => {
    expect(weekInputToMonday({ year: 2026, week: 50 })).toBe("2026-12-07");
  });

  it("puts week 1 of 2026 in the previous calendar year", () => {
    expect(weekInputToMonday({ year: 2026, week: 1 })).toBe("2025-12-29");
  });

  it("accepts week 53 in a year that has one", () => {
    expect(weekInputToMonday({ year: 2026, week: 53 })).toBe("2026-12-28");
  });

  it("rejects week 53 in a year without one", () => {
    expect(() => weekInputToMonday({ year: 2027, week: 53 })).toThrow();
  });
});

describe("mondayToWeekInput", () => {
  it("is the inverse of weekInputToMonday", () => {
    for (const input of [
      { year: 2026, week: 1 },
      { year: 2026, week: 34 },
      { year: 2026, week: 53 },
      { year: 2027, week: 2 },
    ]) {
      expect(mondayToWeekInput(weekInputToMonday(input))).toEqual(input);
    }
  });
});

describe("isValidIsoWeek", () => {
  it("rejects week 0 and week 54", () => {
    expect(isValidIsoWeek({ year: 2026, week: 0 })).toBe(false);
    expect(isValidIsoWeek({ year: 2026, week: 54 })).toBe(false);
  });

  it("rejects fractions and out-of-range years", () => {
    expect(isValidIsoWeek({ year: 2026, week: 3.5 })).toBe(false);
    expect(isValidIsoWeek({ year: 1999, week: 3 })).toBe(false);
  });
});

describe("weekCount", () => {
  it("counts both ends", () => {
    expect(weekCount("2026-08-17", "2026-12-07")).toBe(17);
  });

  it("is one for a single week", () => {
    expect(weekCount("2026-08-17", "2026-08-17")).toBe(1);
  });

  it("is zero when the range is reversed", () => {
    expect(weekCount("2026-12-07", "2026-08-17")).toBe(0);
  });
});
