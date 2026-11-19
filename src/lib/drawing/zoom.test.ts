import { describe, expect, it } from "vitest";

import { clampView, FIT, MAX_SCALE, panBy, zoomAt } from "./zoom";

const frame = { width: 300, height: 600 };

describe("zoom", () => {
  it("zooms about a point that stays put", () => {
    const view = zoomAt(FIT, 2, { x: 100, y: 200 }, frame);
    expect(view).toEqual({ scale: 2, x: -100, y: -200 });
    // The drawing point under (100, 200) is still there: (100 - x) / scale.
    expect((100 - view.x) / view.scale).toBe(100);
  });
  it("does not zoom out past fitting or in past the limit", () => {
    expect(zoomAt(FIT, 0.5, { x: 10, y: 10 }, frame)).toEqual(FIT);
    expect(zoomAt({ scale: 6, x: 0, y: 0 }, 4, { x: 0, y: 0 }, frame).scale).toBe(MAX_SCALE);
  });
  it("keeps the drawing over its frame when panning", () => {
    const zoomed = { scale: 2, x: -100, y: -100 };
    expect(panBy(zoomed, 500, 0, frame)).toEqual({ scale: 2, x: 0, y: -100 });
    expect(panBy(zoomed, -1000, -1000, frame)).toEqual({ scale: 2, x: -300, y: -600 });
    expect(clampView({ scale: 1, x: -40, y: 20 }, frame)).toEqual(FIT);
  });
});
