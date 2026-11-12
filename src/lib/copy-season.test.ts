import { describe, expect, it } from "vitest";

import { alignWeeks, planSeasonCopy, type SeasonCopySource } from "./copy-season";
import { weeksBetween } from "./weeks";

describe("alignWeeks", () => {
  it("maps the n-th source week to the n-th copy week", () => {
    const map = alignWeeks(
      weeksBetween("2026-08-17", "2026-08-31"),
      weeksBetween("2027-08-16", "2027-08-30"),
    );
    expect([...map]).toEqual([
      ["2026-08-17", "2027-08-16"],
      ["2026-08-24", "2027-08-23"],
      ["2026-08-31", "2027-08-30"],
    ]);
  });

  it("drops source weeks beyond the copy's last week", () => {
    const map = alignWeeks(
      weeksBetween("2026-08-17", "2026-09-07"),
      weeksBetween("2027-01-04", "2027-01-11"),
    );
    expect([...map.keys()]).toEqual(["2026-08-17", "2026-08-24"]);
  });

  it("leaves extra copy weeks without a source", () => {
    const map = alignWeeks(["2026-08-17"], weeksBetween("2027-01-04", "2027-01-18"));
    expect(map.size).toBe(1);
    expect(map.get("2026-08-17")).toBe("2027-01-04");
  });

  it("is empty without weeks", () => {
    expect(alignWeeks([], ["2027-01-04"]).size).toBe(0);
    expect(alignWeeks(["2026-08-17"], []).size).toBe(0);
  });
});

const source: SeasonCopySource = {
  trainingSlots: [
    { weekday: 3, startTime: "17:00:00", endTime: "19:00:00", location: "Hallen" },
    { weekday: 7, startTime: null, endTime: null, location: null },
  ],
  disciplines: [
    { id: "d1", name: "Tumbling", sortOrder: 0 },
    { id: "d2", name: "Trampett", sortOrder: 1 },
  ],
  focusItems: [
    { id: "f1", disciplineId: "d1", name: "Airtrack", category: "Redskap", sortOrder: 0 },
    { id: "f2", disciplineId: "d1", name: "Grunder", category: null, sortOrder: 1 },
    { id: "f3", disciplineId: "d2", name: "Landning", category: "Landing", sortOrder: 0 },
  ],
  allocations: [
    { focusItemId: "f1", weekStart: "2026-08-17", level: "high" },
    { focusItemId: "f1", weekStart: "2026-08-24", level: "low" },
    { focusItemId: "f3", weekStart: "2026-08-24", level: "medium" },
  ],
};

function counter() {
  let n = 0;
  return () => `new-${++n}`;
}

describe("planSeasonCopy", () => {
  it("gives disciplines and focus items new ids and keeps references consistent", () => {
    const rows = planSeasonCopy(source, "season-2", counter(), null);
    const ids = [...rows.disciplines.map((d) => d.id), ...rows.focusItems.map((i) => i.id)];
    expect(new Set(ids).size).toBe(5);
    expect(ids.every((id) => id.startsWith("new-"))).toBe(true);

    const tumbling = rows.disciplines.find((d) => d.name === "Tumbling")!;
    const trampett = rows.disciplines.find((d) => d.name === "Trampett")!;
    expect(rows.focusItems.filter((i) => i.disciplineId === tumbling.id).map((i) => i.name)).toEqual([
      "Airtrack",
      "Grunder",
    ]);
    expect(rows.focusItems.filter((i) => i.disciplineId === trampett.id).map((i) => i.name)).toEqual([
      "Landning",
    ]);
  });

  it("keeps sort order and categories and points rows at the new season", () => {
    const rows = planSeasonCopy(source, "season-2", counter(), null);
    expect(rows.disciplines.map((d) => [d.name, d.sortOrder, d.seasonId])).toEqual([
      ["Tumbling", 0, "season-2"],
      ["Trampett", 1, "season-2"],
    ]);
    expect(rows.focusItems.map((i) => [i.name, i.category, i.sortOrder])).toEqual([
      ["Airtrack", "Redskap", 0],
      ["Grunder", null, 1],
      ["Landning", "Landing", 0],
    ]);
    expect(rows.trainingSlots).toEqual([
      { weekday: 3, startTime: "17:00:00", endTime: "19:00:00", location: "Hallen", seasonId: "season-2" },
      { weekday: 7, startTime: null, endTime: null, location: null, seasonId: "season-2" },
    ]);
  });

  it("does not carry over any column the source rows have besides the copied ones", () => {
    // Rows read from the database also hold the source ids and season id.
    const rows = planSeasonCopy(
      {
        ...source,
        trainingSlots: [{ id: "slot-1", seasonId: "season-1", weekday: 3, startTime: null, endTime: null, location: null }],
        disciplines: [{ id: "d1", seasonId: "season-1", name: "Tumbling", sortOrder: 0 }],
        focusItems: [{ id: "f1", disciplineId: "d1", name: "Airtrack", category: null, sortOrder: 0 }],
        allocations: [],
      } as unknown as SeasonCopySource,
      "season-2",
      counter(),
      null,
    );
    expect(rows.trainingSlots).toEqual([
      { seasonId: "season-2", weekday: 3, startTime: null, endTime: null, location: null },
    ]);
    expect(Object.keys(rows.disciplines[0]).sort()).toEqual(["id", "name", "seasonId", "sortOrder"]);
    expect(rows.disciplines[0].seasonId).toBe("season-2");
  });

  it("copies no allocations without a week map", () => {
    expect(planSeasonCopy(source, "s", counter(), null).allocations).toEqual([]);
  });

  it("moves allocations to the aligned week with the new focus item id", () => {
    const weekMap = alignWeeks(["2026-08-17", "2026-08-24"], ["2027-01-04", "2027-01-11"]);
    const rows = planSeasonCopy(source, "s", counter(), weekMap);
    const idOf = (name: string) => rows.focusItems.find((i) => i.name === name)!.id;
    expect(rows.allocations).toEqual([
      { focusItemId: idOf("Airtrack"), weekStart: "2027-01-04", level: "high" },
      { focusItemId: idOf("Airtrack"), weekStart: "2027-01-11", level: "low" },
      { focusItemId: idOf("Landning"), weekStart: "2027-01-11", level: "medium" },
    ]);
  });

  it("drops allocations beyond the copy's last week", () => {
    const weekMap = alignWeeks(["2026-08-17", "2026-08-24"], ["2027-01-04"]);
    const rows = planSeasonCopy(source, "s", counter(), weekMap);
    expect(rows.allocations.map((a) => a.weekStart)).toEqual(["2027-01-04"]);
  });

  it("drops allocations of focus items that are not in the source", () => {
    const weekMap = alignWeeks(["2026-08-17"], ["2027-01-04"]);
    const rows = planSeasonCopy(
      { ...source, allocations: [{ focusItemId: "other", weekStart: "2026-08-17", level: "high" }] },
      "s",
      counter(),
      weekMap,
    );
    expect(rows.allocations).toEqual([]);
  });

  it("copes with an empty season", () => {
    const rows = planSeasonCopy(
      { trainingSlots: [], disciplines: [], focusItems: [], allocations: [] },
      "s",
      counter(),
      new Map(),
    );
    expect(rows).toEqual({ trainingSlots: [], disciplines: [], focusItems: [], allocations: [] });
  });
});
