/*
 * Pure helpers for drawn plans (docs/implementation-plan.md, "Drawn plans").
 * A drawing's own unit is the metre; sizes are stored in whole centimetres.
 * Seen from above, a configuration's width runs along x and its length along y.
 */

/** Centimetres per drawing unit (the metre). */
export const CM_PER_UNIT = 100;

/** Centimetres in drawing units. */
export function cmToUnits(cm: number): number {
  return cm / CM_PER_UNIT;
}

/** A rectangle's size in drawing units. */
export type Size = { width: number; height: number };

/** A configuration's footprint in drawing units: width along x, length along y. */
export function footprint(c: { widthCm: number; lengthCm: number }): Size {
  return { width: cmToUnits(c.widthCm), height: cmToUnits(c.lengthCm) };
}

/** How a configuration is drawn, from what it has. */
export type Look =
  | { kind: "image"; href: string }
  | { kind: "color"; fill: string }
  | { kind: "neutral" };

/** Its image when it has one, otherwise its colour, otherwise a neutral grey. */
export function lookOf(c: { imageUrl: string | null; color: string | null }): Look {
  if (c.imageUrl) {
    return { kind: "image", href: c.imageUrl };
  }
  if (c.color) {
    return { kind: "color", fill: c.color };
  }
  return { kind: "neutral" };
}

/**
 * The largest scale (pixels per drawing unit) at which every one of `shapes`
 * fits on its own inside `box`, at most `max`. All shapes drawn at this one
 * scale can be compared by size. Shapes without area are ignored; with none
 * left the result is `max`.
 */
export function fitScale(shapes: readonly Size[], box: Size, max = Number.POSITIVE_INFINITY): number {
  let scale = max;
  for (const s of shapes) {
    if (s.width > 0 && s.height > 0) {
      scale = Math.min(scale, box.width / s.width, box.height / s.height);
    }
  }
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
