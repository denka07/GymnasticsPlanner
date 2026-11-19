/*
 * Turning the view of a drawing by 90°, without touching the drawing itself
 * (docs/implementation-plan.md, "Drawn plans"). Halls, stations and
 * equipment are mostly longer than wide, with the length along y; on a wide
 * screen they are shown turned a quarter clockwise so the long side runs
 * across. Positions, widths and lengths keep their meaning: only what is
 * shown turns.
 *
 * "Drawing space" is the stored coordinates in metres. "View space" is what
 * the screen shows, in metres too: the drawing turned 90° clockwise about its
 * top-left corner and moved back into view, so the drawing's top-left corner
 * is at the view's top-right.
 */

import { tidy, type Area, type Direction, type Point, type Rect } from "./editor";

/** The view's size: the drawing's, with width and height swapped when turned. */
export function viewArea(area: Area, turned: boolean): Area {
  return turned ? { width: area.height, height: area.width } : area;
}

/** The SVG transform that draws drawing space in view space. */
export function viewTransform(area: Area, turned: boolean): string | undefined {
  // u = H - y, v = x
  return turned ? `matrix(0 1 -1 0 ${area.height} 0)` : undefined;
}

/** A point in drawing space shown at `p` in view space. */
export function toDrawingPoint(p: Point, area: Area, turned: boolean): Point {
  return turned ? { x: tidy(p.y), y: tidy(area.height - p.x) } : p;
}

/** Where a point in drawing space is shown, in view space. */
export function toViewPoint(p: Point, area: Area, turned: boolean): Point {
  return turned ? { x: tidy(area.height - p.y), y: tidy(p.x) } : p;
}

function rectOf(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** A rectangle in drawing space as it is shown, in view space. */
export function rectToView(rect: Rect, area: Area, turned: boolean): Rect {
  return rectOf(
    toViewPoint({ x: rect.x, y: rect.y }, area, turned),
    toViewPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, area, turned),
  );
}

/** A rectangle shown in view space, in drawing space. */
export function rectToDrawing(rect: Rect, area: Area, turned: boolean): Rect {
  return rectOf(
    toDrawingPoint({ x: rect.x, y: rect.y }, area, turned),
    toDrawingPoint({ x: rect.x + rect.width, y: rect.y + rect.height }, area, turned),
  );
}

const TURNED: Record<Direction, Direction> = {
  // On screen right is drawing up, down is drawing right, and so on.
  right: "up",
  left: "down",
  down: "right",
  up: "left",
};

/** The drawing-space direction of an arrow key, so items move the way the screen shows. */
export function drawingDirection(direction: Direction, turned: boolean): Direction {
  return turned ? TURNED[direction] : direction;
}

/**
 * Whether to turn the view by default: when the drawing's long side and the
 * canvas's long side differ, so the long side follows the canvas. A square
 * drawing or canvas, or one not measured yet, is not turned.
 */
export function turnByDefault(area: Area, canvas: { width: number; height: number } | null): boolean {
  if (!canvas || canvas.width <= 0 || canvas.height <= 0 || area.width === area.height) {
    return false;
  }
  if (canvas.width === canvas.height) {
    return false;
  }
  return area.width > area.height !== canvas.width > canvas.height;
}

/**
 * Inline style for a turned group: text that should stay upright on screen
 * reads `--upright` (see UPRIGHT_CLASS) to turn back by the same amount.
 */
export function uprightStyle(turned: boolean): Record<string, string> | undefined {
  return turned ? { "--upright": "-90deg" } : undefined;
}

/**
 * Classes for an SVG text (or group) that stays upright on screen: turned
 * about its own centre by `--upright`, set where the view is turned.
 */
export const UPRIGHT_CLASS = "[transform-box:fill-box] [transform-origin:center] [rotate:var(--upright,0deg)]";

/** The key a drawing's chosen view is remembered under in localStorage. */
export function viewStorageKey(drawing: string): string {
  return `drawing-view:${drawing}`;
}
