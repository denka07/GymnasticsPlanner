import { describe, expect, it } from "vitest";

import { drawingBounds, labelBox, readMargin, unionRects } from "./bounds";

const area = { width: 20, height: 30 };

describe("labelBox", () => {
  it("estimates a label's box from its length and size, centred on its point", () => {
    const box = labelBox({ x: 10, y: 5, text: "Ribbstol", size: 1 });
    // 8 characters × 0.6 + halo 0.25 wide, 1.2 + 0.25 high.
    expect(box.width).toBeCloseTo(5.05);
    expect(box.height).toBeCloseTo(1.45);
    expect(box.x + box.width / 2).toBeCloseTo(10);
    expect(box.y + box.height / 2).toBeCloseTo(5);
  });
  it("lies along the drawing's y in a turned view, where labels stay upright on screen", () => {
    const box = labelBox({ x: 0, y: 0, text: "Port", size: 1 }, { turned: true });
    expect(box.width).toBeCloseTo(1.45);
    expect(box.height).toBeCloseTo(2.65);
  });
  it("turns with its rotation when it is not kept upright", () => {
    const box = labelBox({ x: 0, y: 0, text: "Port", size: 1, rotation: 90 }, { upright: false });
    expect(box.height).toBeCloseTo(2.65);
  });
});

describe("unionRects", () => {
  it("covers every rectangle", () => {
    expect(unionRects([{ x: 0, y: 0, width: 2, height: 2 }, { x: -1, y: 3, width: 1, height: 1 }])).toEqual({
      x: -1,
      y: 0,
      width: 3,
      height: 4,
    });
    expect(unionRects([])).toBeNull();
  });
});

describe("drawingBounds", () => {
  it("is the area with its margin when everything is inside", () => {
    expect(drawingBounds({ area, labels: [{ x: 10, y: 10, text: "MD-grop", size: 0.6 }] }, false, 0.5)).toEqual({
      x: -0.5,
      y: -0.5,
      width: 21,
      height: 31,
    });
  });
  it("grows to show a label at the hall's edge", () => {
    // Wall bars on the left wall, labelled at their centre.
    const bounds = drawingBounds({ area, labels: [{ x: 0.2, y: 8, text: "Ribbstol", size: 0.67 }] }, false, 0);
    expect(bounds.x).toBeCloseTo(0.2 - (8 * 0.6 + 0.25) * 0.67 / 2);
    expect(bounds.y).toBe(0);
    expect(bounds.x + bounds.width).toBe(20);
  });
  it("grows along the other axis in a turned view", () => {
    const label = { x: 10, y: 29.9, text: "Till AB-hallen", size: 0.67 };
    expect(drawingBounds({ area, labels: [label] }, false, 0).height).toBeGreaterThan(30);
    const turned = drawingBounds({ area, labels: [{ ...label, y: 15, x: 19.9 }] }, true, 0);
    expect(turned.x + turned.width).toBeCloseTo(19.9 + (1.2 + 0.25) * 0.67 / 2);
  });
  it("includes items and boxes outside the area, rotation included", () => {
    const bounds = drawingBounds(
      {
        area,
        items: [{ id: "a", x: 20, y: 15, width: 4, height: 2, rotation: 90 }],
        boxes: [{ x: -2, y: -2, width: 1, height: 1 }],
      },
      false,
      0,
    );
    expect(bounds).toEqual({ x: -2, y: -2, width: 23, height: 32 });
  });
  it("ignores empty labels", () => {
    expect(drawingBounds({ area, labels: [{ x: -50, y: 0, text: " ", size: 1 }] }, false, 0).x).toBe(0);
  });
});

describe("readMargin", () => {
  it("is 1 % of the long side", () => {
    expect(readMargin(area)).toBeCloseTo(0.3);
  });
});
