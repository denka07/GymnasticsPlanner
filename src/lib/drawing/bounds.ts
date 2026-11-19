/*
 * The part of a drawing that is shown: the hall (or area), everything placed
 * in it and every label, so labels near an edge are not cut off. Only what
 * is shown grows; positions, placing and snapping stay relative to the area.
 * All in metres, in drawing space (see view.ts).
 */

import { boundsOf, tidy, type Area, type Placed, type Rect } from "./editor";

/** A label as DrawingLabel draws it: centred on a point, `size` metres high. */
export type LabelSpec = { x: number; y: number; text: string; size: number; rotation?: number };

/** A label's width per character, as a share of its size (a medium sans-serif, a little generous). */
const CHAR_WIDTH = 0.6;
/** A label's line height, as a share of its size. */
const LINE_HEIGHT = 1.2;
/** The light outline around a label's letters, as a share of its size. */
const HALO = 0.25;

/**
 * The box a label takes. `upright` labels (DrawingLabel) stay upright on
 * screen, so in a view turned 90° their width runs along the drawing's y.
 * Other labels turn with their `rotation`.
 */
export function labelBox(label: LabelSpec, { turned = false, upright = true } = {}): Rect {
  const width = Math.max(label.text.length, 1) * CHAR_WIDTH * label.size + HALO * label.size;
  const height = LINE_HEIGHT * label.size + HALO * label.size;
  const rotation = upright ? (turned ? 90 : 0) : (label.rotation ?? 0);
  return boundsOf({ id: "", x: label.x, y: label.y, width, height, rotation });
}

/** The smallest rectangle around all the given ones. */
export function unionRects(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) {
    return null;
  }
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const r of rects) {
    left = Math.min(left, r.x);
    top = Math.min(top, r.y);
    right = Math.max(right, r.x + r.width);
    bottom = Math.max(bottom, r.y + r.height);
  }
  return { x: tidy(left), y: tidy(top), width: tidy(right - left), height: tidy(bottom - top) };
}

/** What a drawing shows besides its area. */
export type DrawingExtent = {
  area: Area;
  /** Placed items, rotation included. */
  items?: readonly Placed[];
  /** Other boxes already in drawing space (for example station numbers). */
  boxes?: readonly Rect[];
  /** Labels kept upright on screen. */
  labels?: readonly LabelSpec[];
};

/**
 * The part of the drawing to show: the area, its items, boxes and labels,
 * with `margin` metres around. In a turned view upright labels lie the
 * other way, so the bounds depend on `turned`.
 */
export function drawingBounds(extent: DrawingExtent, turned: boolean, margin: number): Rect {
  const all = unionRects([
    { x: 0, y: 0, width: extent.area.width, height: extent.area.height },
    ...(extent.items ?? []).map(boundsOf),
    ...(extent.boxes ?? []),
    ...(extent.labels ?? []).filter((l) => l.text.trim() !== "").map((l) => labelBox(l, { turned })),
  ])!;
  return {
    x: tidy(all.x - margin),
    y: tidy(all.y - margin),
    width: tidy(all.width + 2 * margin),
    height: tidy(all.height + 2 * margin),
  };
}

/** The margin of a read-only drawing: 1 % of the area's long side. */
export function readMargin(area: Area): number {
  return Math.max(area.width, area.height) * 0.01;
}

/** An SVG viewBox attribute for a rectangle. */
export function viewBoxOf(rect: Rect): string {
  return `${rect.x} ${rect.y} ${rect.width} ${rect.height}`;
}
