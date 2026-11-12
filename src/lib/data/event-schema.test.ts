import { describe, expect, it } from "vitest";

import { eventInput } from "./schemas";

describe("eventInput", () => {
  it("accepts a valid event and trims the name", () => {
    expect(
      eventInput.parse({ name: " Falun ", type: "competition", startDate: "2026-10-20", endDate: "2026-10-21" }),
    ).toEqual({ name: "Falun", type: "competition", startDate: "2026-10-20", endDate: "2026-10-21" });
  });

  it("defaults the end date to the start date", () => {
    for (const endDate of ["", null, undefined]) {
      expect(
        eventInput.parse({ name: "Uppvisning", type: "show", startDate: "2026-12-02", endDate }).endDate,
      ).toBe("2026-12-02");
    }
  });

  it("rejects an end date before the start date", () => {
    const result = eventInput.safeParse({
      name: "X",
      type: "camp",
      startDate: "2026-10-20",
      endDate: "2026-10-19",
    });
    expect(result.success).toBe(false);
    expect(!result.success && result.error.issues[0].message).toBe("dateOrder");
  });

  it("rejects a missing name, an unknown type and bad dates", () => {
    const ok = { name: "X", type: "camp", startDate: "2026-10-20", endDate: "" };
    expect(eventInput.safeParse({ ...ok, name: "  " }).success).toBe(false);
    expect(eventInput.safeParse({ ...ok, type: "party" }).success).toBe(false);
    expect(eventInput.safeParse({ ...ok, startDate: "" }).success).toBe(false);
    expect(eventInput.safeParse({ ...ok, startDate: "2026-02-31" }).success).toBe(false);
    expect(eventInput.safeParse({ ...ok, endDate: "20-10-2026" }).success).toBe(false);
  });

  it("allows an event across years", () => {
    expect(
      eventInput.safeParse({ name: "X", type: "other", startDate: "2026-12-30", endDate: "2027-01-02" }).success,
    ).toBe(true);
  });
});
