import { describe, expect, it } from "vitest";

import {
  groupByDay,
  parseWeekParam,
  weekItems,
  type WeekSeasonInput,
  type WeekStoredInput,
} from "./start-week";

const CURRENT = "2026-11-09";

describe("parseWeekParam", () => {
  it("accepts a Monday", () => {
    expect(parseWeekParam("2026-08-31", CURRENT)).toBe("2026-08-31");
  });
  it.each([undefined, "", "abc", "2026-08-30", "2026-02-30", "2026-8-31", "1999-01-04", ["2026-08-31"]])(
    "falls back for %j",
    (value) => {
      expect(parseWeekParam(value, CURRENT)).toBe(CURRENT);
    },
  );
});

const slots = [
  { id: "s1", weekday: 2, startTime: "17:00", endTime: "18:30", location: "Hall A" },
  { id: "s2", weekday: 4, startTime: null, endTime: null, location: null },
];

function season(over: Partial<WeekSeasonInput> = {}): WeekSeasonInput {
  return {
    seasonId: "se1",
    groupId: "g1",
    groupName: "Trupp 5",
    slots,
    isBreak: false,
    inRange: true,
    canOpenSeason: true,
    ...over,
  };
}

function stored(over: Partial<WeekStoredInput> = {}): WeekStoredInput {
  return {
    id: "x1",
    seasonId: "se1",
    date: "2026-11-10",
    startTime: "17:00",
    location: "Hall A",
    trainingSlotId: "s1",
    isCancelled: false,
    partCount: 2,
    ...over,
  };
}

describe("weekItems", () => {
  it("adds placeholders for slots without a stored session", () => {
    const items = weekItems(CURRENT, [season()], []);
    expect(items.map((i) => [i.date, i.sessionId, i.state])).toEqual([
      ["2026-11-10", null, "unplanned"],
      ["2026-11-12", null, "unplanned"],
    ]);
  });

  it("lets a stored session replace its slot's placeholder", () => {
    const items = weekItems(CURRENT, [season()], [stored()]);
    expect(items.map((i) => [i.sessionId, i.state])).toEqual([
      ["x1", "planned"],
      [null, "unplanned"],
    ]);
  });

  it("marks cancelled and empty stored sessions", () => {
    const items = weekItems(
      CURRENT,
      [season({ slots: [] })],
      [stored({ isCancelled: true }), stored({ id: "x2", date: "2026-11-11", partCount: 0 })],
    );
    expect(items.map((i) => i.state)).toEqual(["cancelled", "unplanned"]);
  });

  it("gives no placeholders in a break week or outside the season", () => {
    expect(weekItems(CURRENT, [season({ isBreak: true })], [])).toEqual([]);
    expect(weekItems(CURRENT, [season({ inRange: false })], [])).toEqual([]);
  });

  it("keeps stored sessions in a break week", () => {
    const items = weekItems(CURRENT, [season({ isBreak: true })], [stored()]);
    expect(items).toHaveLength(1);
  });

  it("gives no placeholders without season access but shows the shared session", () => {
    const items = weekItems(CURRENT, [season({ canOpenSeason: false })], [stored()]);
    expect(items.map((i) => i.sessionId)).toEqual(["x1"]);
  });

  it("merges seasons in time order, timeless sessions last", () => {
    const other = season({
      seasonId: "se2",
      groupId: "g2",
      groupName: "Annan",
      slots: [{ id: "t1", weekday: 2, startTime: "16:00", endTime: null, location: null }],
    });
    const items = weekItems(CURRENT, [season(), other], []);
    expect(items.map((i) => [i.date, i.groupName])).toEqual([
      ["2026-11-10", "Annan"],
      ["2026-11-10", "Trupp 5"],
      ["2026-11-12", "Trupp 5"],
    ]);
  });

  it("ignores stored sessions of other weeks", () => {
    expect(weekItems(CURRENT, [season({ slots: [] })], [stored({ date: "2026-11-17" })])).toEqual([]);
  });
});

describe("groupByDay", () => {
  it("groups consecutive items by date", () => {
    const days = groupByDay([{ date: "a" }, { date: "a" }, { date: "b" }]);
    expect(days.map((d) => [d.date, d.items.length])).toEqual([
      ["a", 2],
      ["b", 1],
    ]);
  });
  it("returns nothing for no items", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
