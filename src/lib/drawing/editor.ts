/*
 * Pure geometry of the drawing editor (docs/implementation-plan.md, "Drawn
 * plans"), shared by halls, station layouts and session plans. Everything is
 * in metres. An item's position is its centre, measured from the drawing's
 * top-left corner; its rotation is in degrees clockwise; its width runs
 * along x and its height (a configuration's length) along y before
 * rotation. Items are kept in layer order: later items are drawn on top.
 */

/** What the editor needs of every item. */
export type Placed = {
  id: string;
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
};

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };
export type Area = { width: number; height: number };

/** Grid steps the editor offers, in metres. */
export const GRID_STEPS = [0.25, 0.5, 1] as const;
export const DEFAULT_GRID = 0.5;
/** Rotation snapping, in degrees. */
export const ROTATION_STEP = 15;

const EPSILON = 1e-9;

/** Rounds away floating-point noise, so 0.1 + 0.2 is 0.3: a centimetre has two decimals in metres. */
export function tidy(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** The nearest multiple of `step`; `value` itself when snapping is off (null). */
export function snap(value: number, step: number | null): number {
  if (!step || step <= 0) {
    return tidy(value);
  }
  return tidy(Math.round(value / step + EPSILON) * step);
}

/** Degrees in [0, 360). */
export function normalizeAngle(degrees: number): number {
  const d = degrees % 360;
  const n = d < 0 ? d + 360 : d;
  return n >= 360 - EPSILON ? 0 : tidy(n);
}

/** An angle snapped to `step` degrees (none when null), in [0, 360). */
export function snapAngle(degrees: number, step: number | null): number {
  return normalizeAngle(step ? Math.round(degrees / step) * step : degrees);
}

/**
 * The angle in degrees clockwise from straight up, from `center` to `point`:
 * dragging a handle above an item turns it by this.
 */
export function angleTo(center: Point, point: Point): number {
  const radians = Math.atan2(point.x - center.x, center.y - point.y);
  return normalizeAngle((radians * 180) / Math.PI);
}

/** The axis-aligned box around a rotated item. */
export function boundsOf(item: Placed): Rect {
  const r = (item.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(r));
  const sin = Math.abs(Math.sin(r));
  const w = item.width * cos + item.height * sin;
  const h = item.width * sin + item.height * cos;
  return { x: item.x - w / 2, y: item.y - h / 2, width: w, height: h };
}

/** The box around several items, or null for none. */
export function unionBounds(items: readonly Placed[]): Rect | null {
  if (items.length === 0) {
    return null;
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of items) {
    const b = boundsOf(item);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** A rectangle from two corners in any order. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;
}

/** The ids of the items whose box touches `rect`, as a marquee selects them. */
export function idsInRect(items: readonly Placed[], rect: Rect): string[] {
  return items.filter((item) => intersects(boundsOf(item), rect)).map((item) => item.id);
}

/** A centre kept inside the area (an item may hang over the edge, its centre may not leave). */
export function clampPoint(point: Point, area: Area): Point {
  return {
    x: Math.min(Math.max(point.x, 0), area.width),
    y: Math.min(Math.max(point.y, 0), area.height),
  };
}

/**
 * How far to move a selection when the pointer has moved by `delta` from
 * where the drag began on `anchor` (the item that was grabbed): the anchor's
 * centre lands on the grid, and every selected item moves the same.
 */
export function dragDelta(anchor: Point, delta: Point, grid: number | null): Point {
  return {
    x: tidy(snap(anchor.x + delta.x, grid) - anchor.x),
    y: tidy(snap(anchor.y + delta.y, grid) - anchor.y),
  };
}

/**
 * Moves the selected items by `delta`. The move is shortened as a whole so
 * that no centre leaves the area, which keeps the items' arrangement.
 */
export function moveBy<T extends Placed>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  delta: Point,
  area: Area,
): T[] {
  const moving = items.filter((i) => ids.has(i.id));
  if (moving.length === 0 || (delta.x === 0 && delta.y === 0)) {
    return [...items];
  }
  let dx = delta.x;
  let dy = delta.y;
  for (const i of moving) {
    dx = Math.min(Math.max(dx, -i.x), area.width - i.x);
    dy = Math.min(Math.max(dy, -i.y), area.height - i.y);
  }
  return items.map((i) => (ids.has(i.id) ? { ...i, x: tidy(i.x + dx), y: tidy(i.y + dy) } : i));
}

/** Arrow-key directions. */
export type Direction = "left" | "right" | "up" | "down";

const DIRECTION: Record<Direction, Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** Moves the selected items one `step` in a direction. */
export function nudge<T extends Placed>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  direction: Direction,
  step: number,
  area: Area,
): T[] {
  const d = DIRECTION[direction];
  return moveBy(items, ids, { x: d.x * step, y: d.y * step }, area);
}

/** Turns each selected item by `degrees` about its own centre, snapped to `step` when given. */
export function rotateBy<T extends Placed>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  degrees: number,
  step: number | null,
): T[] {
  return items.map((i) => (ids.has(i.id) ? { ...i, rotation: snapAngle(i.rotation + degrees, step) } : i));
}

/** Sets the selected items' rotation, snapped to `step` when given. */
export function rotateTo<T extends Placed>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  degrees: number,
  step: number | null,
): T[] {
  const angle = snapAngle(degrees, step);
  return items.map((i) => (ids.has(i.id) ? { ...i, rotation: angle } : i));
}

/** Changes one item. */
export function updateItem<T extends Placed>(items: readonly T[], id: string, patch: Partial<T>): T[] {
  return items.map((i) => (i.id === id ? { ...i, ...patch, id: i.id } : i));
}

/** Removes the selected items. */
export function removeItems<T extends Placed>(items: readonly T[], ids: ReadonlySet<string>): T[] {
  return items.filter((i) => !ids.has(i.id));
}

/**
 * Copies the selected items, moved by `offset` (kept inside the area), on
 * top of everything in their relative order. Returns the items and the new
 * ids, which become the selection.
 */
export function duplicate<T extends Placed>(
  items: readonly T[],
  ids: ReadonlySet<string>,
  makeId: () => string,
  offset: Point,
  area: Area,
): { items: T[]; ids: string[] } {
  const copies = items
    .filter((i) => ids.has(i.id))
    .map((i) => {
      const at = clampPoint({ x: tidy(i.x + offset.x), y: tidy(i.y + offset.y) }, area);
      return { ...i, id: makeId(), x: at.x, y: at.y };
    });
  return { items: [...items, ...copies], ids: copies.map((c) => c.id) };
}

/** Adds an item on top. */
export function addItem<T extends Placed>(items: readonly T[], item: T): T[] {
  return [...items, item];
}

export type LayerMove = "forward" | "backward" | "front" | "back";

/**
 * Changes the selected items' layer: one step up or down past an item that
 * is not selected, or to the top or bottom, keeping their relative order.
 */
export function reorder<T extends Placed>(items: readonly T[], ids: ReadonlySet<string>, move: LayerMove): T[] {
  const selected = items.filter((i) => ids.has(i.id));
  const others = items.filter((i) => !ids.has(i.id));
  if (selected.length === 0) {
    return [...items];
  }
  if (move === "front") {
    return [...others, ...selected];
  }
  if (move === "back") {
    return [...selected, ...others];
  }
  const result = [...items];
  if (move === "forward") {
    for (let i = result.length - 2; i >= 0; i--) {
      if (ids.has(result[i].id) && !ids.has(result[i + 1].id)) {
        [result[i], result[i + 1]] = [result[i + 1], result[i]];
      }
    }
  } else {
    for (let i = 1; i < result.length; i++) {
      if (ids.has(result[i].id) && !ids.has(result[i - 1].id)) {
        [result[i], result[i - 1]] = [result[i - 1], result[i]];
      }
    }
  }
  return result;
}

/** A spot for a new item: the point snapped to the grid and kept inside the area. */
export function placeAt(point: Point, grid: number | null, area: Area): Point {
  return clampPoint({ x: snap(point.x, grid), y: snap(point.y, grid) }, area);
}

// --- The view (zoom and pan) -----------------------------------------------------

/** The part of the drawing that is shown, in metres. */
export type ViewBox = Rect;

/** Zoom limits, as the shown width in metres. */
export const MIN_VIEW = 1;
export const MAX_VIEW = 400;

/** The whole area with a margin around it. */
export function fitView(area: Area, margin = 1): ViewBox {
  return { x: -margin, y: -margin, width: area.width + 2 * margin, height: area.height + 2 * margin };
}

/**
 * Zooms by `factor` (above 1 zooms in) keeping `point` where it is on the
 * screen; the shown width stays within MIN_VIEW and MAX_VIEW.
 */
export function zoomAt(view: ViewBox, factor: number, point: Point): ViewBox {
  const width = Math.min(Math.max(view.width / factor, MIN_VIEW), MAX_VIEW);
  const f = view.width / width;
  const height = view.height / f;
  return {
    x: point.x - (point.x - view.x) / f,
    y: point.y - (point.y - view.y) / f,
    width,
    height,
  };
}

/** Moves the view so the drawing follows a drag by `delta` metres. */
export function panBy(view: ViewBox, delta: Point): ViewBox {
  return { ...view, x: view.x - delta.x, y: view.y - delta.y };
}

/** The positions of grid lines from 0 to `length`, every `step`. */
export function gridPositions(length: number, step: number): number[] {
  const result: number[] = [];
  if (step <= 0) {
    return result;
  }
  const count = Math.floor(length / step + EPSILON);
  for (let i = 0; i <= count; i++) {
    result.push(tidy(i * step));
  }
  return result;
}
