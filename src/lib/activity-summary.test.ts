import { describe, expect, it } from "vitest";

import { summarize } from "./activity-summary";

describe("summarize", () => {
  it("is empty for no names", () => {
    expect(summarize([])).toEqual({ shown: [], more: 0 });
  });

  it("lists one or two names without a counter", () => {
    expect(summarize(["A"])).toEqual({ shown: ["A"], more: 0 });
    expect(summarize(["A", "B"])).toEqual({ shown: ["A", "B"], more: 0 });
  });

  it("shows the first two and counts the rest", () => {
    expect(summarize(["A", "B", "C"])).toEqual({ shown: ["A", "B"], more: 1 });
    expect(summarize(["A", "B", "C", "D", "E"])).toEqual({ shown: ["A", "B"], more: 3 });
  });

  it("keeps the given order", () => {
    expect(summarize(["Z", "A", "M"]).shown).toEqual(["Z", "A"]);
  });
});
