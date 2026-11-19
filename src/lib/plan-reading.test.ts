import { describe, expect, it } from "vitest";

import {
  imageSize,
  pageOrientation,
  planImageName,
  planOfPart,
  printChoice,
  printedPlans,
  printHref,
  readingOrder,
} from "./plan-reading";

const main = { id: "main", isMain: true, partIds: [] };
const jump = { id: "jump", isMain: false, partIds: ["p3"] };
const warmUp = { id: "warm", isMain: false, partIds: ["p4", "p1"] };
const orphan = { id: "orphan", isMain: false, partIds: [] };
const parts = ["p1", "p2", "p3", "p4"];

describe("planOfPart", () => {
  it("shows a part's own plan", () => {
    expect(planOfPart("p3", [main, jump])).toBe(jump);
  });
  it("shows the main plan for a part without its own", () => {
    expect(planOfPart("p2", [jump, main])).toBe(main);
  });
  it("shows nothing without a plan for the part or a main plan", () => {
    expect(planOfPart("p2", [jump])).toBeNull();
    expect(planOfPart("p2", [])).toBeNull();
  });
});

describe("readingOrder", () => {
  it("puts the main plan first, then part plans by their first part, plans without parts last", () => {
    expect(readingOrder([orphan, jump, warmUp, main], parts).map((p) => p.id)).toEqual([
      "main",
      "warm",
      "jump",
      "orphan",
    ]);
  });
  it("ignores parts that are not in the session", () => {
    const gone = { id: "gone", isMain: false, partIds: ["x"] };
    expect(readingOrder([gone, jump], parts).map((p) => p.id)).toEqual(["jump", "gone"]);
  });
});

describe("printing", () => {
  const plans = [jump, main, warmUp];
  it("reads the choice from the search parameter", () => {
    expect(printChoice("jump", plans)).toEqual({ planId: "jump" });
    expect(printChoice(["warm", "jump"], plans)).toEqual({ planId: "warm" });
    expect(printChoice(undefined, plans)).toBe("all");
    expect(printChoice("all", plans)).toBe("all");
    expect(printChoice("someone-elses-plan", plans)).toBe("all");
  });
  it("prints every plan in reading order, or the chosen one", () => {
    expect(printedPlans(plans, parts, "all").map((p) => p.id)).toEqual(["main", "warm", "jump"]);
    expect(printedPlans(plans, parts, { planId: "jump" }).map((p) => p.id)).toEqual(["jump"]);
  });
  it("links to the print view", () => {
    expect(printHref("s1", "all")).toBe("/sessions/s1/plans/print");
    expect(printHref("s1", { planId: "jump" })).toBe("/sessions/s1/plans/print?plan=jump");
  });
  it("prints a drawing wider than tall in landscape", () => {
    expect(pageOrientation({ widthCm: 4200, lengthCm: 2450 })).toBe("landscape");
    expect(pageOrientation({ widthCm: 2450, lengthCm: 4200 })).toBe("portrait");
    expect(pageOrientation({ widthCm: 2000, lengthCm: 2000 })).toBe("portrait");
  });
});

describe("planImageName", () => {
  it("names the image after the session's date and the plan", () => {
    expect(planImageName("2026-08-31", "Trampettbanan")).toBe("2026-08-31 Trampettbanan.png");
  });
  it("replaces characters a file name cannot have", () => {
    expect(planImageName("2026-08-31", "Volt/Salto: bana?")).toBe("2026-08-31 Volt-Salto- bana.png");
  });
  it("keeps only the date without a usable name", () => {
    expect(planImageName("2026-08-31", " ... ")).toBe("2026-08-31.png");
  });
});

describe("imageSize", () => {
  it("keeps the proportions with the long side fixed", () => {
    expect(imageSize({ width: 24.5, height: 42 }, 2400)).toEqual({ width: 1400, height: 2400 });
    expect(imageSize({ width: 42, height: 21 }, 2400)).toEqual({ width: 2400, height: 1200 });
  });
});
