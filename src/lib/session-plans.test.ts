import { describe, expect, it } from "vitest";

import {
  autoLinkActivity,
  contentSize,
  copyItems,
  copyMapping,
  keepAllowedLinks,
  linkedActivityIds,
  newPlanInput,
  partsOfPlan,
  planItemsInput,
  stationBox,
  stationNumbers,
  stationsOfParts,
  toPlanInput,
  type DrawnPlanItem,
  type OutlinePart,
  type PlanParts,
} from "./session-plans";
import type { DrawnLayoutItem } from "./station-layouts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const outline: OutlinePart[] = [
  { id: "warm", activities: [{ id: "a1", stationId: null }] },
  {
    id: "tramp",
    activities: [
      { id: "a2", stationId: "s-tramp" },
      { id: "a3", stationId: null },
      { id: "a4", stationId: "s-mat" },
    ],
  },
  { id: "floor", activities: [{ id: "a5", stationId: "s-mat" }, { id: "a6", stationId: "s-mat" }] },
];

const main: PlanParts = { id: "main", isMain: true, partIds: [] };
const trampPlan: PlanParts = { id: "p-tramp", isMain: false, partIds: ["tramp"] };

function station(itemId: string, activityId: string | null, extra: Partial<DrawnPlanItem> = {}): DrawnPlanItem {
  return {
    id: itemId,
    xCm: 500,
    yCm: 500,
    rotation: 0,
    label: null,
    content: { kind: "station", stationId: "s-mat", activityId, adapted: false, name: "Matta", layout: [] },
    ...extra,
  };
}

describe("partsOfPlan", () => {
  it("gives the main plan every part without a plan of its own", () => {
    expect(partsOfPlan(main, [main, trampPlan], outline).map((p) => p.id)).toEqual(["warm", "floor"]);
  });

  it("gives a part plan its own parts in the session's order", () => {
    const plan = { id: "x", isMain: false, partIds: ["floor", "warm"] };
    expect(partsOfPlan(plan, [main, plan], outline).map((p) => p.id)).toEqual(["warm", "floor"]);
  });

  it("gives a plan without parts none", () => {
    const orphan = { id: "o", isMain: false, partIds: [] };
    expect(partsOfPlan(orphan, [main, orphan], outline)).toEqual([]);
    expect(partsOfPlan(main, [main, orphan], outline)).toHaveLength(3);
  });
});

describe("stationNumbers", () => {
  it("numbers linked activities in the session's order, skipping unlinked ones", () => {
    const numbers = stationNumbers(outline, ["a6", "a2", "a4"]);
    expect([...numbers]).toEqual([
      ["a2", 1],
      ["a4", 2],
      ["a6", 3],
    ]);
  });

  it("ignores links outside the parts", () => {
    const parts = partsOfPlan(trampPlan, [main, trampPlan], outline);
    expect([...stationNumbers(parts, ["a5", "a4"])]).toEqual([["a4", 1]]);
  });

  it("follows the activities when they are reordered", () => {
    const reordered: OutlinePart[] = [outline[2], outline[1]];
    expect(stationNumbers(reordered, ["a2", "a5"]).get("a5")).toBe(1);
  });
});

describe("autoLinkActivity", () => {
  it("links when exactly one activity in the parts uses the station", () => {
    expect(autoLinkActivity("s-tramp", outline, new Set())).toBe("a2");
  });

  it("does not link when several activities use it", () => {
    expect(autoLinkActivity("s-mat", outline, new Set())).toBeNull();
  });

  it("does not link when none uses it, or the one is taken", () => {
    expect(autoLinkActivity("s-other", outline, new Set())).toBeNull();
    expect(autoLinkActivity("s-tramp", outline, new Set(["a2"]))).toBeNull();
  });

  it("only looks in the plan's parts", () => {
    const parts = partsOfPlan(trampPlan, [main, trampPlan], outline);
    expect(autoLinkActivity("s-mat", parts, new Set())).toBe("a4");
  });
});

describe("keepAllowedLinks", () => {
  it("drops links outside the allowed activities and a second link to one", () => {
    const items = [station("i1", "a4"), station("i2", "a5"), station("i3", "a4")];
    const kept = keepAllowedLinks(items, new Set(["a4"]));
    expect(linkedActivityIds(kept)).toEqual(["a4"]);
    expect(kept[0]).toBe(items[0]);
  });
});

describe("stationsOfParts", () => {
  it("lists the stations the parts use, in order, once each", () => {
    expect(stationsOfParts(outline)).toEqual(["s-tramp", "s-mat"]);
  });
});

describe("copyMapping", () => {
  it("maps parts and activities by position", () => {
    const copy = [
      { id: "w2", activities: [{ id: "b1" }] },
      { id: "t2", activities: [{ id: "b2" }, { id: "b3" }, { id: "b4" }] },
    ];
    const { parts, activities } = copyMapping(outline, copy);
    expect(parts.get("tramp")).toBe("t2");
    expect(parts.has("floor")).toBe(false);
    expect(activities.get("a4")).toBe("b4");
    expect(activities.has("a5")).toBe(false);
  });
});

describe("copyItems", () => {
  it("gives new ids, maps links and copies an adapted layout", () => {
    const layout: DrawnLayoutItem[] = [{ id: "l1", kind: "arrow", lengthCm: 300, xCm: 0, yCm: 0, rotation: 0, label: null }];
    const adapted = station("i2", "a5", {
      content: { kind: "station", stationId: null, activityId: "a5", adapted: true, name: "Gammal", layout },
    });
    let n = 0;
    const copied = copyItems([station("i1", "a4"), adapted], () => `new${++n}`, (a) => (a === "a4" ? "b4" : null));
    expect(copied.map((i) => i.id)).toEqual(["new1", "new2"]);
    expect(linkedActivityIds(copied)).toEqual(["b4"]);
    const c = copied[1].content;
    expect(c.kind === "station" && c.layout[0].id).toBe("new3");
  });
});

describe("stationBox", () => {
  it("is centred on the station's centre", () => {
    const layout: DrawnLayoutItem[] = [
      { id: "l1", kind: "arrow", lengthCm: 400, xCm: 300, yCm: 0, rotation: 0, label: null },
    ];
    // The arrow runs from 1 m to 5 m right of the centre: the box is 10 m wide.
    expect(stationBox(layout).width).toBeCloseTo(10);
  });

  it("is a square for a station without a layout", () => {
    expect(stationBox([])).toEqual({ width: 2, height: 2 });
  });
});

describe("contentSize", () => {
  it("measures areas and people", () => {
    expect(contentSize({ kind: "area", widthCm: 400, lengthCm: 250 })).toEqual({ width: 4, height: 2.5 });
    expect(contentSize({ kind: "person", role: "coach" }).width).toBeGreaterThan(0);
  });
});

describe("planItemsInput", () => {
  const base = { xCm: 100, yCm: 200, rotation: 370, label: " " };

  it("accepts every kind and normalises rotation and labels", () => {
    const items = planItemsInput.parse([
      { ...base, id: id(1), kind: "equipment", equipmentId: id(10), configurationId: id(11) },
      { ...base, id: id(2), kind: "station", stationId: id(12), activityId: id(13), adapted: null },
      { ...base, id: id(3), kind: "text", text: "  Nedförsbacke   här " },
      { ...base, id: id(4), kind: "area", widthCm: 400, lengthCm: 300 },
      { ...base, id: id(5), kind: "person", role: "passare" },
      { ...base, id: id(6), kind: "arrow", lengthCm: 300 },
    ]);
    expect(items[0].rotation).toBe(10);
    expect(items[0].label).toBeNull();
    expect(items[2].kind === "text" && items[2].text).toBe("Nedförsbacke här");
  });

  it("refuses an activity linked twice", () => {
    const station = (n: number) => ({ ...base, id: id(n), kind: "station", stationId: id(12), activityId: id(13), adapted: null });
    expect(planItemsInput.safeParse([station(1), station(2)]).error?.issues[0].message).toBe("activityLinkedTwice");
  });

  it("refuses a station without a station unless adapted, and repeated ids", () => {
    expect(
      planItemsInput.safeParse([{ ...base, id: id(1), kind: "station", stationId: null, activityId: null, adapted: null }]).success,
    ).toBe(false);
    expect(
      planItemsInput.safeParse([
        { ...base, id: id(1), kind: "station", stationId: null, activityId: null, adapted: { name: "X", items: [] } },
      ]).success,
    ).toBe(true);
    const text = { ...base, id: id(1), kind: "text", text: "A" };
    expect(planItemsInput.safeParse([text, text]).success).toBe(false);
  });

  it("refuses positions outside a hall's largest size and bad sizes", () => {
    expect(planItemsInput.safeParse([{ ...base, id: id(1), xCm: -1, kind: "text", text: "A" }]).success).toBe(false);
    expect(
      planItemsInput.safeParse([{ ...base, id: id(1), kind: "area", widthCm: 0, lengthCm: 10 }]).error?.issues[0].message,
    ).toBe("areaSizeInvalid");
    expect(planItemsInput.safeParse([{ ...base, id: id(1), kind: "person", role: "boss" }]).success).toBe(false);
  });

  it("round-trips a drawn item through toPlanInput", () => {
    const drawn = station(id(1), id(13), { id: id(1) });
    const c = drawn.content;
    const withIds: DrawnPlanItem = { ...drawn, content: c.kind === "station" ? { ...c, stationId: id(12) } : c };
    expect(planItemsInput.parse([toPlanInput(withIds)])[0]).toMatchObject({ kind: "station", activityId: id(13) });
  });
});

describe("newPlanInput", () => {
  it("needs parts for a part plan and none for the main plan", () => {
    expect(newPlanInput.safeParse({ main: true, partIds: [], name: null, copyFromPlanId: null }).success).toBe(true);
    expect(newPlanInput.safeParse({ main: false, partIds: [], name: null, copyFromPlanId: null }).success).toBe(false);
    expect(newPlanInput.safeParse({ main: true, partIds: [id(1)], name: null, copyFromPlanId: null }).success).toBe(false);
  });
});
