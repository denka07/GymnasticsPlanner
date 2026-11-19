/*
 * Zooming and panning a read-only drawing on a phone: a scale and an offset
 * in screen pixels, applied to a drawing that fits its frame at scale 1.
 */

export type ZoomView = { scale: number; x: number; y: number };

export const FIT: ZoomView = { scale: 1, x: 0, y: 0 };
export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
/** One step of the zoom buttons. */
export const ZOOM_STEP = 1.5;

/**
 * Keeps the drawing over its frame: it cannot be dragged further than its
 * edges, and at scale 1 it fits exactly.
 */
export function clampView(view: ZoomView, frame: { width: number; height: number }): ZoomView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale));
  const minX = frame.width - frame.width * scale;
  const minY = frame.height - frame.height * scale;
  return {
    scale,
    x: Math.min(0, Math.max(minX, view.x)),
    y: Math.min(0, Math.max(minY, view.y)),
  };
}

/** Zooms by `factor` about a point of the frame, which stays where it is. */
export function zoomAt(
  view: ZoomView,
  factor: number,
  point: { x: number; y: number },
  frame: { width: number; height: number },
): ZoomView {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const k = scale / view.scale;
  return clampView({ scale, x: point.x - (point.x - view.x) * k, y: point.y - (point.y - view.y) * k }, frame);
}

/** Moves the drawing by a distance in screen pixels. */
export function panBy(view: ZoomView, dx: number, dy: number, frame: { width: number; height: number }): ZoomView {
  return clampView({ ...view, x: view.x + dx, y: view.y + dy }, frame);
}
