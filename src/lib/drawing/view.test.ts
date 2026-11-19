import { describe, expect, it } from "vitest";

import { fitView, nudge, type Placed } from "./editor";
import {
  drawingDirection,
  rectToDrawing,
  rectToView,
  toDrawingPoint,
  toViewPoint,
  turnByDefault,
  viewArea,
  viewTransform,
} from "./view";

// A portrait hall: 20 m across, 30 m long.
const hall = { width: 20, height: 30 };

describe("viewArea", () => {
  it("swaps width and height when turned", () => {
    expect(viewArea(hall, true)).toEqual({ width: 30, height: 20 });
    expect(viewArea(hall, false)).toBe(hall);
  });
});

describe("points", () => {
  it("shows the drawing's top-left corner at the view's top-right", () => {
    expect(toViewPoint({ x: 0, y: 0 }, hall, true)).toEqual({ x: 30, y: 0 });
    expect(toViewPoint({ x: 20, y: 30 }, hall, true)).toEqual({ x: 0, y: 20 });
  });

  it("maps view points back to the same drawing points", () => {
    const p = { x: 3.5, y: 12.25 };
    expect(toDrawingPoint(toViewPoint(p, hall, true), hall, true)).toEqual(p);
    expect(toDrawingPoint(p, hall, false)).toBe(p);
  });

  it("matches the SVG transform", () => {
    // matrix(a b c d e f): u = a x + c y + e, v = b x + d y + f
    const [a, b, c, d, e, f] = viewTransform(hall, true)!.match(/-?[\d.]+/g)!.map(Number);
    const p = { x: 4, y: 7 };
    expect({ x: a * p.x + c * p.y + e, y: b * p.x + d * p.y + f }).toEqual(toViewPoint(p, hall, true));
    expect(viewTransform(hall, false)).toBeUndefined();
  });
});

describe("rectangles", () => {
  it("turns a fitted view into the turned view's fit and back", () => {
    const fit = fitView(hall);
    expect(rectToView(fit, hall, true)).toEqual(fitView(viewArea(hall, true)));
    expect(rectToDrawing(rectToView(fit, hall, true), hall, true)).toEqual(fit);
  });

  it("keeps a selection box's corners", () => {
    const shown = { x: 25, y: 2, width: 4, height: 6 };
    expect(rectToDrawing(shown, hall, true)).toEqual({ x: 2, y: 1, width: 6, height: 4 });
  });
});

describe("drawingDirection", () => {
  it("moves items the way the screen shows when turned", () => {
    const item: Placed = { id: "a", x: 10, y: 10, rotation: 0, width: 1, height: 1 };
    for (const key of ["left", "right", "up", "down"] as const) {
      const [moved] = nudge([item], new Set(["a"]), drawingDirection(key, true), 1, hall);
      const before = toViewPoint(item, hall, true);
      const after = toViewPoint(moved, hall, true);
      const shown = { x: after.x - before.x, y: after.y - before.y };
      const expected = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, up: { x: 0, y: -1 }, down: { x: 0, y: 1 } }[key];
      expect(shown).toEqual(expected);
    }
    expect(drawingDirection("left", false)).toBe("left");
  });
});

describe("turnByDefault", () => {
  it("turns a portrait drawing on a wide canvas and a landscape one on a tall canvas", () => {
    expect(turnByDefault(hall, { width: 1200, height: 700 })).toBe(true);
    expect(turnByDefault(hall, { width: 400, height: 800 })).toBe(false);
    expect(turnByDefault({ width: 40, height: 20 }, { width: 400, height: 800 })).toBe(true);
    expect(turnByDefault({ width: 40, height: 20 }, { width: 1200, height: 700 })).toBe(false);
  });

  it("does not turn square drawings or before measuring", () => {
    expect(turnByDefault({ width: 10, height: 10 }, { width: 1200, height: 700 })).toBe(false);
    expect(turnByDefault(hall, null)).toBe(false);
    expect(turnByDefault(hall, { width: 0, height: 0 })).toBe(false);
  });
});
