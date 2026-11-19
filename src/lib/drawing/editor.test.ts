import { describe, expect, it } from "vitest";

import {
  angleTo,
  boundsOf,
  dragDelta,
  duplicate,
  fitView,
  gridPositions,
  idsInRect,
  moveBy,
  nudge,
  panBy,
  placeAt,
  rectFromPoints,
  removeItems,
  reorder,
  rotateBy,
  rotateTo,
  snap,
  snapAngle,
  unionBounds,
  updateItem,
  zoomAt,
  type Placed,
} from "./editor";

const area = { width: 20, height: 40 };

function item(id: string, x: number, y: number, extra: Partial<Placed> = {}): Placed {
  return { id, x, y, rotation: 0, width: 2, height: 1, ...extra };
}

const ids = (...list: string[]) => new Set(list);
const order = (items: Placed[]) => items.map((i) => i.id).join("");

describe("snap", () => {
  it("rounds to the grid step without floating-point noise", () => {
    expect(snap(1.26, 0.25)).toBe(1.25);
    expect(snap(1.38, 0.25)).toBe(1.5);
    expect(snap(0.74, 0.5)).toBe(0.5);
    expect(snap(0.75, 0.5)).toBe(1);
    expect(snap(2.4, 1)).toBe(2);
    expect(snap(0.1 + 0.2, null)).toBe(0.3);
  });
});

describe("angles", () => {
  it("snaps to 15° steps and keeps angles in [0, 360)", () => {
    expect(snapAngle(7, 15)).toBe(0);
    expect(snapAngle(8, 15)).toBe(15);
    expect(snapAngle(-10, 15)).toBe(345);
    expect(snapAngle(361.5, null)).toBe(1.5);
    expect(snapAngle(359.9, 15)).toBe(0);
  });

  it("measures clockwise from straight up", () => {
    const c = { x: 5, y: 5 };
    expect(angleTo(c, { x: 5, y: 1 })).toBe(0);
    expect(angleTo(c, { x: 9, y: 5 })).toBe(90);
    expect(angleTo(c, { x: 5, y: 9 })).toBe(180);
    expect(angleTo(c, { x: 1, y: 5 })).toBe(270);
  });
});

describe("bounds and selection", () => {
  it("turns the box with the item", () => {
    expect(boundsOf(item("a", 5, 5))).toEqual({ x: 4, y: 4.5, width: 2, height: 1 });
    const turned = boundsOf(item("a", 5, 5, { rotation: 90 }));
    expect(turned.width).toBeCloseTo(1);
    expect(turned.height).toBeCloseTo(2);
    const diagonal = boundsOf(item("a", 0, 0, { width: 1, height: 1, rotation: 45 }));
    expect(diagonal.width).toBeCloseTo(Math.SQRT2);
  });

  it("unites boxes and selects what a marquee touches", () => {
    const items = [item("a", 2, 2), item("b", 10, 10), item("c", 18, 38)];
    expect(unionBounds(items)).toEqual({ x: 1, y: 1.5, width: 18, height: 37 });
    expect(unionBounds([])).toBeNull();
    expect(idsInRect(items, rectFromPoints({ x: 12, y: 12 }, { x: 0, y: 0 }))).toEqual(["a", "b"]);
    expect(idsInRect(items, { x: 3.1, y: 0, width: 1, height: 1 })).toEqual([]);
  });
});

describe("moving", () => {
  it("lands the grabbed item on the grid and moves the others the same", () => {
    expect(dragDelta({ x: 1.2, y: 3 }, { x: 0.9, y: 0.1 }, 0.5)).toEqual({ x: 0.8, y: 0 });
    expect(dragDelta({ x: 1.2, y: 3 }, { x: 0.93, y: 0.1 }, null)).toEqual({ x: 0.93, y: 0.1 });
  });

  it("moves only the selection and keeps every centre inside the area", () => {
    const items = [item("a", 1, 1), item("b", 5, 5), item("c", 8, 8)];
    const moved = moveBy(items, ids("a", "b"), { x: 3, y: -3 }, area);
    expect(moved.map((i) => [i.x, i.y])).toEqual([
      [4, 0],
      [8, 4],
      [8, 8],
    ]);
    // Shortened as a whole, so the two keep their distance.
    const far = moveBy(items, ids("a", "b"), { x: 100, y: 0 }, area);
    expect(far[1].x - far[0].x).toBe(4);
    expect(far[1].x).toBe(20);
  });

  it("nudges by a step with the arrow keys", () => {
    const items = [item("a", 1, 1)];
    expect(nudge(items, ids("a"), "right", 0.5, area)[0]).toMatchObject({ x: 1.5, y: 1 });
    expect(nudge(items, ids("a"), "up", 0.25, area)[0]).toMatchObject({ x: 1, y: 0.75 });
    expect(nudge(items, ids("a"), "left", 2, area)[0]).toMatchObject({ x: 0, y: 1 });
  });

  it("places new items on the grid inside the area", () => {
    expect(placeAt({ x: 3.3, y: -2 }, 0.5, area)).toEqual({ x: 3.5, y: 0 });
  });
});

describe("rotating", () => {
  it("turns the selection by or to an angle, snapped when asked", () => {
    const items = [item("a", 1, 1, { rotation: 10 }), item("b", 2, 2)];
    expect(rotateBy(items, ids("a"), 15, 15).map((i) => i.rotation)).toEqual([30, 0]);
    expect(rotateBy(items, ids("a", "b"), -20, null).map((i) => i.rotation)).toEqual([350, 340]);
    expect(rotateTo(items, ids("b"), 95, 15).map((i) => i.rotation)).toEqual([10, 90]);
  });
});

describe("editing the list", () => {
  it("updates, removes and duplicates items", () => {
    const items = [item("a", 1, 1), item("b", 5, 5), item("c", 19.5, 9)];
    expect(updateItem(items, "b", { x: 7, id: "z" })[1]).toMatchObject({ id: "b", x: 7 });
    expect(order(removeItems(items, ids("a", "c")))).toBe("b");
    let n = 0;
    const copy = duplicate(items, ids("c", "a"), () => `n${++n}`, { x: 1, y: 1 }, area);
    expect(order(copy.items)).toBe("abcn1n2");
    expect(copy.ids).toEqual(["n1", "n2"]);
    expect(copy.items[3]).toMatchObject({ x: 2, y: 2 });
    expect(copy.items[4]).toMatchObject({ x: 20, y: 10 });
  });

  it("changes layer order keeping the selection's own order", () => {
    const items = ["a", "b", "c", "d", "e"].map((id, i) => item(id, i, i));
    expect(order(reorder(items, ids("b", "d"), "front"))).toBe("acebd");
    expect(order(reorder(items, ids("b", "d"), "back"))).toBe("bdace");
    expect(order(reorder(items, ids("b", "d"), "forward"))).toBe("acbed");
    expect(order(reorder(items, ids("b", "d"), "backward"))).toBe("badce");
    expect(order(reorder(items, ids("e"), "forward"))).toBe("abcde");
    expect(order(reorder(items, ids("a"), "backward"))).toBe("abcde");
  });
});

describe("the view", () => {
  it("fits the area with a margin", () => {
    expect(fitView(area, 1)).toEqual({ x: -1, y: -1, width: 22, height: 42 });
  });

  it("zooms about a point that stays put", () => {
    const view = { x: 0, y: 0, width: 20, height: 10 };
    const zoomed = zoomAt(view, 2, { x: 10, y: 5 });
    expect(zoomed).toEqual({ x: 5, y: 2.5, width: 10, height: 5 });
    const corner = zoomAt(view, 2, { x: 0, y: 0 });
    expect(corner).toMatchObject({ x: 0, y: 0, width: 10 });
  });

  it("keeps zoom within limits and pans with the drag", () => {
    expect(zoomAt({ x: 0, y: 0, width: 2, height: 1 }, 10, { x: 1, y: 0.5 }).width).toBe(1);
    expect(zoomAt({ x: 0, y: 0, width: 300, height: 150 }, 0.1, { x: 0, y: 0 }).width).toBe(400);
    expect(panBy({ x: 0, y: 0, width: 10, height: 10 }, { x: 2, y: -1 })).toMatchObject({ x: -2, y: 1 });
  });

  it("puts grid lines every step from 0 to the end", () => {
    expect(gridPositions(1.5, 0.5)).toEqual([0, 0.5, 1, 1.5]);
    expect(gridPositions(1.2, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
});
