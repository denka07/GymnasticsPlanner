import { describe, expect, it } from "vitest";

import { ARROW_THICKNESS, arrowShape, arrowSize, arrowTip, cleanText, MAX_TEXT_LENGTH, textSize, TEXT_SIZE } from "./annotations";

describe("arrowShape", () => {
  it("runs the shaft along the middle to a head that ends at the tip", () => {
    const shape = arrowShape(3);
    const mid = ARROW_THICKNESS / 2;
    expect(shape.shaft).toEqual({ x1: 0, y1: mid, x2: 2.5, y2: mid });
    expect(shape.head).toEqual([
      { x: 2.5, y: 0 },
      { x: 2.5, y: ARROW_THICKNESS },
      { x: 3, y: mid },
    ]);
  });

  it("keeps the head at most a third of a short arrow", () => {
    const shape = arrowShape(0.6);
    expect(shape.shaft.x2).toBeCloseTo(0.4);
    expect(shape.head[2].x).toBeCloseTo(0.6);
  });
});

describe("arrowSize and arrowTip", () => {
  it("is as wide as the arrow is long", () => {
    expect(arrowSize(450)).toEqual({ width: 4.5, height: ARROW_THICKNESS });
  });

  it("finds the tip from the centre, length and rotation", () => {
    expect(arrowTip({ x: 10, y: 10 }, 4, 0)).toEqual({ x: 12, y: 10 });
    expect(arrowTip({ x: 10, y: 10 }, 4, 90)).toEqual({ x: 10, y: 12 });
    expect(arrowTip({ x: 10, y: 10 }, 4, 180)).toEqual({ x: 8, y: 10 });
  });
});

describe("textSize and cleanText", () => {
  it("grows with the text and keeps one line's height", () => {
    const short = textSize("Ansats");
    const long = textSize("Ansats från långsidan");
    expect(short.height).toBe(TEXT_SIZE);
    expect(long.width).toBeGreaterThan(short.width);
  });

  it("keeps an empty text pickable", () => {
    expect(textSize("  ")).toEqual({ width: TEXT_SIZE, height: TEXT_SIZE });
  });

  it("puts a text on one line and cuts it to the longest allowed", () => {
    expect(cleanText("  två\nrader  ")).toBe("två rader");
    expect([...cleanText("å".repeat(MAX_TEXT_LENGTH + 5))].length).toBe(MAX_TEXT_LENGTH);
  });
});
