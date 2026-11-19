import { describe, expect, it } from "vitest";

import { doorSwing, hatchLines, rowLines, stripeLines } from "./feature-look";

describe("stripeLines", () => {
  it("draws rungs across the long side", () => {
    const along = stripeLines(1, 0.2, 0.25);
    expect(along.map((l) => l.x1)).toEqual([0.25, 0.5, 0.75]);
    expect(along.every((l) => l.x1 === l.x2 && l.y1 === 0 && l.y2 === 0.2)).toBe(true);
    const upright = stripeLines(0.2, 1, 0.5);
    expect(upright).toEqual([{ x1: 0, y1: 0.5, x2: 0.2, y2: 0.5 }]);
  });

  it("limits the number of lines for huge features", () => {
    expect(stripeLines(10000, 1, 0.15).length).toBeLessThanOrEqual(400);
  });
});

describe("rowLines", () => {
  it("draws rows along the long side", () => {
    expect(rowLines(10, 2, 0.8).map((l) => l.y1)).toEqual([0.8, 1.6]);
    expect(rowLines(2, 10, 0.8).every((l) => l.y1 === 0 && l.y2 === 10)).toBe(true);
  });
});

describe("hatchLines", () => {
  it("cuts every diagonal to the rectangle", () => {
    const lines = hatchLines(2, 1, 0.5);
    expect(lines.length).toBe(5);
    for (const l of lines) {
      for (const [x, y] of [
        [l.x1, l.y1],
        [l.x2, l.y2],
      ]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(2);
        expect(y).toBeGreaterThanOrEqual(-1e-9);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
    expect(lines[0]).toEqual({ x1: 0, y1: 0.5, x2: 0.5, y2: 0 });
  });
});

describe("doorSwing", () => {
  it("swings a leaf as wide as the opening into the hall side", () => {
    const along = doorSwing(1, 0.2);
    expect(along.leaf).toEqual({ x1: 0, y1: 0.2, x2: 0, y2: 1.2 });
    expect(along.arc).toBe("M 1 0.2 A 1 1 0 0 1 0 1.2");
    const upright = doorSwing(0.2, 1);
    expect(upright.leaf).toEqual({ x1: 0.2, y1: 0, x2: 1.2, y2: 0 });
  });
});
