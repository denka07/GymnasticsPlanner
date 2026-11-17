import { describe, expect, it } from "vitest";

import {
  eventDaysInWeek,
  groupByDay,
  parseWeekParam,
  weekDays,
  weekItems,
  type WeekEventInput,
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

  it("orders sessions on one day by start time, timeless last and stable", () => {
    const day = "2026-11-11";
    const s = (id: string, startTime: string | null) =>
      stored({ id, date: day, startTime, trainingSlotId: null });
    const items = weekItems(
      CURRENT,
      [season({ slots: [] })],
      [s("c", null), s("b", "18:00"), s("z", null), s("a", "09:30")],
    );
    expect(items.map((i) => i.sessionId)).toEqual(["a", "b", "c", "z"]);
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

const MON = "2026-11-09";

function ev(over: Partial<WeekEventInput>): WeekEventInput {
  return {
    id: "e1",
    seasonId: "s1",
    groupId: "g1",
    groupName: "Trupp",
    name: "Falun",
    type: "competition",
    startDate: MON,
    endDate: MON,
    description: null,
    ...over,
  };
}

describe("eventDaysInWeek", () => {
  it("lists every covered day of the week", () => {
    expect(eventDaysInWeek(MON, { startDate: "2026-11-10", endDate: "2026-11-12" })).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
    ]);
  });
  it("clips an event that starts before and ends after the week", () => {
    expect(eventDaysInWeek(MON, { startDate: "2026-11-01", endDate: "2026-11-30" })).toHaveLength(7);
  });
  it("is empty for an event outside the week", () => {
    expect(eventDaysInWeek(MON, { startDate: "2026-11-16", endDate: "2026-11-17" })).toEqual([]);
    expect(eventDaysInWeek(MON, { startDate: "2026-11-01", endDate: "2026-11-08" })).toEqual([]);
  });
  it("keeps only the Sunday of an event that begins the week before", () => {
    expect(eventDaysInWeek(MON, { startDate: "2026-11-08", endDate: "2026-11-09" })).toEqual([MON]);
  });
});

describe("weekDays", () => {
  const session = (date: string, time: string) => ({ date, time });

  it("puts events before sessions and repeats a multi-day event on each day", () => {
    const days = weekDays(
      MON,
      [session("2026-11-10", "17:00"), session("2026-11-11", "17:00")],
      [ev({ startDate: "2026-11-10", endDate: "2026-11-11" })],
    );
    expect(days.map((d) => [d.date, d.events.length, d.items.length])).toEqual([
      ["2026-11-10", 1, 1],
      ["2026-11-11", 1, 1],
    ]);
  });
  it("includes days with only events and leaves out empty days", () => {
    const days = weekDays(MON, [session("2026-11-09", "17:00")], [ev({ id: "x", startDate: "2026-11-13", endDate: "2026-11-13" })]);
    expect(days.map((d) => d.date)).toEqual([MON, "2026-11-13"]);
    expect(days[1].items).toEqual([]);
  });
  it("orders events by start date, type, name", () => {
    const days = weekDays(
      MON,
      [],
      [
        ev({ id: "a", name: "B", type: "camp", startDate: "2026-11-10", endDate: "2026-11-10" }),
        ev({ id: "b", name: "Z", type: "competition", startDate: "2026-11-09", endDate: "2026-11-10" }),
        ev({ id: "c", name: "A", type: "competition", startDate: "2026-11-10", endDate: "2026-11-10" }),
      ],
    );
    expect(days[1].events.map((e) => e.id)).toEqual(["b", "c", "a"]);
  });
  it("is empty without sessions and events", () => {
    expect(weekDays(MON, [], [])).toEqual([]);
  });
});
