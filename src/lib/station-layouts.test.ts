import { describe, expect, it } from "vitest";

import {
  canPlace,
  configurationsMatch,
  layoutItemSize,
  layoutView,
  MAX_LAYOUT_ITEMS,
  placementsLeft,
  pruneLayout,
  stationLayoutInput,
  type LayoutItemLike,
} from "./station-layouts";

const PLINT = "11111111-1111-4111-8111-111111111111";
const MATTA = "22222222-2222-4222-8222-222222222222";
const KIL = "33333333-3333-4333-8333-333333333333";
const CONF = "44444444-4444-4444-8444-444444444444";

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

type Item = LayoutItemLike & { id: string };

const eq = (id: string, equipmentId: string): Item => ({ id, kind: "equipment", equipmentId });
const arrow = (id: string): Item => ({ id, kind: "arrow" });

describe("placementsLeft and canPlace", () => {
  const lines = [
    { equipmentId: PLINT, quantity: 1 },
    { equipmentId: MATTA, quantity: 2 },
  ];

  it("counts down each line's quantity by what is placed", () => {
    const left = placementsLeft([eq("a", MATTA), arrow("b")], lines);
    expect(left.get(PLINT)).toBe(1);
    expect(left.get(MATTA)).toBe(1);
  });

  it("allows placing up to the quantity and no further", () => {
    expect(canPlace(MATTA, [eq("a", MATTA)], lines)).toBe(true);
    expect(canPlace(MATTA, [eq("a", MATTA), eq("b", MATTA)], lines)).toBe(false);
  });

  it("does not allow equipment the station does not need", () => {
    expect(canPlace(KIL, [], lines)).toBe(false);
  });
});

describe("pruneLayout", () => {
  it("keeps everything that fits", () => {
    const items = [eq("a", PLINT), arrow("b"), eq("c", MATTA)];
    const result = pruneLayout(items, [
      { equipmentId: PLINT, quantity: 1 },
      { equipmentId: MATTA, quantity: 1 },
    ]);
    expect(result.kept).toEqual(items);
    expect(result.removed).toEqual([]);
  });

  it("removes equipment the station no longer needs", () => {
    const result = pruneLayout([eq("a", PLINT), eq("b", KIL), arrow("c")], [
      { equipmentId: PLINT, quantity: 1 },
    ]);
    expect(result.kept.map((i) => i.id)).toEqual(["a", "c"]);
    expect(result.removed.map((i) => i.id)).toEqual(["b"]);
  });

  it("removes the topmost placements beyond a lowered quantity", () => {
    const items = [eq("bottom", MATTA), arrow("x"), eq("middle", MATTA), eq("top", MATTA)];
    const result = pruneLayout(items, [{ equipmentId: MATTA, quantity: 1 }]);
    expect(result.kept.map((i) => i.id)).toEqual(["bottom", "x"]);
    expect(result.removed.map((i) => i.id)).toEqual(["middle", "top"]);
  });

  it("keeps arrows and texts when all equipment is gone", () => {
    const items: Item[] = [eq("a", PLINT), arrow("b"), { id: "c", kind: "text" }];
    const result = pruneLayout(items, []);
    expect(result.kept.map((i) => i.id)).toEqual(["b", "c"]);
    expect(result.removed.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("configurationsMatch", () => {
  it("needs each equipment item's configuration to belong to its equipment", () => {
    const owners = new Map([[CONF, PLINT]]);
    expect(
      configurationsMatch([{ kind: "equipment", equipmentId: PLINT, configurationId: CONF }], owners),
    ).toBe(true);
    expect(
      configurationsMatch([{ kind: "equipment", equipmentId: MATTA, configurationId: CONF }], owners),
    ).toBe(false);
    expect(configurationsMatch([{ kind: "arrow" }], owners)).toBe(true);
  });
});

describe("stationLayoutInput", () => {
  const base = { xCm: 0, yCm: -50, rotation: 0, label: null };

  it("accepts equipment, arrows and texts", () => {
    const parsed = stationLayoutInput.parse([
      { ...base, id: uuid(1), kind: "equipment", equipmentId: PLINT, configurationId: CONF },
      { ...base, id: uuid(2), kind: "arrow", lengthCm: 400, rotation: -90 },
      { ...base, id: uuid(3), kind: "text", text: "  Ansats \n här ", label: "  " },
    ]);
    expect(parsed[1]).toMatchObject({ rotation: 270 });
    expect(parsed[2]).toMatchObject({ text: "Ansats här", label: null });
  });

  it("refuses positions beyond 10 m from the centre and fractions of a centimetre", () => {
    const arrowAt = (xCm: number) => [{ ...base, xCm, id: uuid(1), kind: "arrow", lengthCm: 100 }];
    expect(stationLayoutInput.safeParse(arrowAt(1000)).success).toBe(true);
    expect(stationLayoutInput.safeParse(arrowAt(1001)).success).toBe(false);
    expect(stationLayoutInput.safeParse(arrowAt(10.5)).success).toBe(false);
  });

  it("refuses arrows that are too short or too long and empty texts", () => {
    const one = (item: object) => stationLayoutInput.safeParse([{ ...base, id: uuid(1), ...item }]);
    expect(one({ kind: "arrow", lengthCm: 5 }).success).toBe(false);
    expect(one({ kind: "arrow", lengthCm: 2001 }).success).toBe(false);
    expect(one({ kind: "text", text: "   " }).success).toBe(false);
    expect(one({ kind: "text", text: "x".repeat(201) }).success).toBe(false);
  });

  it("refuses fields of another kind, repeated ids and too many items", () => {
    expect(
      stationLayoutInput.safeParse([{ ...base, id: uuid(1), kind: "arrow", lengthCm: 100, text: "x" }])
        .success,
    ).toBe(false);
    const twice = { ...base, id: uuid(1), kind: "arrow", lengthCm: 100 };
    expect(stationLayoutInput.safeParse([twice, twice]).success).toBe(false);
    const many = Array.from({ length: MAX_LAYOUT_ITEMS + 1 }, (_, i) => ({
      ...base,
      id: uuid(i + 1),
      kind: "arrow",
      lengthCm: 100,
    }));
    expect(stationLayoutInput.safeParse(many).success).toBe(false);
  });
});

describe("layoutItemSize and layoutView", () => {
  const placement = { id: uuid(1), xCm: 0, yCm: 0, rotation: 0, label: null };
  const matta = {
    ...placement,
    kind: "equipment" as const,
    equipmentId: MATTA,
    configurationId: CONF,
    equipmentName: "Tjockmatta",
    configurationName: "Liggande",
    widthCm: 200,
    lengthCm: 300,
    color: null,
    imageUrl: null,
  };

  it("takes equipment's size from its configuration and an arrow's from its length", () => {
    expect(layoutItemSize(matta)).toEqual({ width: 2, height: 3 });
    expect(layoutItemSize({ ...placement, kind: "arrow", lengthCm: 500 }).width).toBe(5);
  });

  it("is null for an empty layout", () => {
    expect(layoutView([])).toBeNull();
  });

  it("shows every item with a margin, turned items by their turned box", () => {
    const view = layoutView([matta, { ...matta, id: uuid(2), xCm: 400, rotation: 90 }], 0.5)!;
    // The first spans x -1..1, the turned one 4-1.5..4+1.5 = 2.5..5.5.
    expect(view.x).toBeCloseTo(-1.5);
    expect(view.width).toBeCloseTo(7.5);
    expect(view.y).toBeCloseTo(-2);
    expect(view.height).toBeCloseTo(4);
  });

  it("is at least the minimum across, centred on the items", () => {
    const view = layoutView([{ ...placement, kind: "text", text: "A", xCm: 100 }], 0, 2)!;
    expect(view.width).toBe(2);
    expect(view.x + view.width / 2).toBeCloseTo(1);
  });
});
