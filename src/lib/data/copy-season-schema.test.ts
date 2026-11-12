import { describe, expect, it } from "vitest";

import { copySeasonInput } from "./schemas";

const groupId = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const ok = {
  name: "2027 HT test",
  firstWeek: { year: 2027, week: 34 },
  lastWeek: { year: 2027, week: 50 },
  groupId,
  includeAllocations: false,
};

describe("copySeasonInput", () => {
  it("converts the weeks to Mondays", () => {
    expect(copySeasonInput.parse(ok)).toEqual({
      name: "2027 HT test",
      firstWeek: "2027-08-23",
      lastWeek: "2027-12-13",
      groupId,
      includeAllocations: false,
    });
  });

  it("trims the name and requires one", () => {
    expect(copySeasonInput.parse({ ...ok, name: "  X  " }).name).toBe("X");
    expect(copySeasonInput.safeParse({ ...ok, name: " " }).success).toBe(false);
  });

  it("applies the same week rules as creating a season", () => {
    const reversed = copySeasonInput.safeParse({ ...ok, lastWeek: { year: 2027, week: 20 } });
    expect(!reversed.success && reversed.error.issues[0].message).toBe("weekOrder");

    const tooLong = copySeasonInput.safeParse({ ...ok, lastWeek: { year: 2028, week: 52 } });
    expect(!tooLong.success && tooLong.error.issues[0].message).toBe("tooManyWeeks");

    const noWeek53 = copySeasonInput.safeParse({ ...ok, lastWeek: { year: 2027, week: 53 } });
    expect(!noWeek53.success && noWeek53.error.issues[0].message).toBe("invalidWeek");
  });

  it("requires a group id and a boolean for the plan", () => {
    expect(copySeasonInput.safeParse({ ...ok, groupId: "nope" }).success).toBe(false);
    expect(copySeasonInput.safeParse({ ...ok, includeAllocations: "yes" }).success).toBe(false);
    expect(copySeasonInput.parse({ ...ok, includeAllocations: true }).includeAllocations).toBe(true);
  });
});
