import { describe, expect, it } from "vitest";

import { cmToUnits, fitScale, footprint, lookOf } from "./geometry";

describe("cmToUnits", () => {
  it("turns centimetres into metres", () => {
    expect(cmToUnits(200)).toBe(2);
    expect(cmToUnits(35)).toBe(0.35);
    expect(cmToUnits(5000)).toBe(50);
  });
});

describe("footprint", () => {
  it("puts the width along x and the length along y", () => {
    expect(footprint({ widthCm: 200, lengthCm: 100 })).toEqual({ width: 2, height: 1 });
  });
});

describe("lookOf", () => {
  it("prefers the image over the colour", () => {
    expect(lookOf({ imageUrl: "/api/equipment-images/x?v=1", color: "#2563a8" })).toEqual({
      kind: "image",
      href: "/api/equipment-images/x?v=1",
    });
  });

  it("uses the colour without an image", () => {
    expect(lookOf({ imageUrl: null, color: "#2563a8" })).toEqual({ kind: "color", fill: "#2563a8" });
  });

  it("is neutral with neither", () => {
    expect(lookOf({ imageUrl: null, color: null })).toEqual({ kind: "neutral" });
  });
});

describe("fitScale", () => {
  const box = { width: 200, height: 100 };

  it("is limited by the shape that fits worst", () => {
    // 2 × 1 m fits at 100 px/m; 1 × 2 m only at 50 px/m.
    expect(fitScale([{ width: 2, height: 1 }, { width: 1, height: 2 }], box)).toBe(50);
  });

  it("never exceeds the maximum", () => {
    expect(fitScale([{ width: 0.5, height: 0.5 }], box, 80)).toBe(80);
  });

  it("shrinks large shapes to fit", () => {
    expect(fitScale([{ width: 20, height: 2 }], box)).toBe(10);
  });

  it("ignores shapes without area and falls back to the maximum", () => {
    expect(fitScale([{ width: 0, height: 3 }], box, 60)).toBe(60);
    expect(fitScale([], box, 60)).toBe(60);
  });

  it("returns a usable scale without shapes or maximum", () => {
    expect(fitScale([], box)).toBe(1);
  });
});
