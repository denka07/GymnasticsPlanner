import { describe, expect, it } from "vitest";

import { neighbours, nextSessions, progress, todayInStockholm, type NextCandidate } from "./session-view";

describe("progress", () => {
  it("counts parts and activities separately", () => {
    expect(progress([])).toEqual({ done: 0, total: 0 });
    expect(
      progress([
        { isDone: true, activities: [{ isDone: false }, { isDone: true }] },
        { isDone: false, activities: [] },
      ]),
    ).toEqual({ done: 2, total: 4 });
  });
  it("does not tick a part when its activities are all done", () => {
    expect(progress([{ isDone: false, activities: [{ isDone: true }] }])).toEqual({ done: 1, total: 2 });
  });
});

describe("neighbours", () => {
  const s = (id: string, date: string, startTime: string | null = null) => ({ id, date, startTime });
  const all = [s("c", "2026-09-03", "18:00"), s("a", "2026-09-02", "17:00"), s("b", "2026-09-02", null)];
  it("orders by date, then time with untimed last", () => {
    expect(neighbours(all, "b")).toEqual({ previous: all[1], next: all[0] });
  });
  it("has no previous at the start and no next at the end", () => {
    expect(neighbours(all, "a").previous).toBeNull();
    expect(neighbours(all, "c").next).toBeNull();
  });
  it("gives nothing for an unknown session", () => {
    expect(neighbours(all, "x")).toEqual({ previous: null, next: null });
  });
});

describe("nextSessions", () => {
  const c = (over: Partial<NextCandidate> & { id: string }): NextCandidate => ({
    groupId: "g1",
    date: "2026-11-20",
    startTime: "17:00",
    isCancelled: false,
    partCount: 1,
    ...over,
  });
  it("picks the earliest upcoming session per group, today included", () => {
    const list = [
      c({ id: "late", date: "2026-11-25" }),
      c({ id: "today", date: "2026-11-13", startTime: "18:00" }),
      c({ id: "early-today", date: "2026-11-13", startTime: "16:00" }),
      c({ id: "other", groupId: "g2", date: "2026-11-14" }),
    ];
    expect(nextSessions(list, ["g1", "g2"], "2026-11-13").map((s) => s.id)).toEqual([
      "early-today",
      "other",
    ]);
  });
  it("skips past, cancelled and empty sessions, and groups without any", () => {
    const list = [
      c({ id: "past", date: "2026-11-12" }),
      c({ id: "cancelled", isCancelled: true }),
      c({ id: "empty", partCount: 0 }),
      c({ id: "ok", date: "2026-12-01", groupId: "g3" }),
    ];
    expect(nextSessions(list, ["g1", "g2", "g3"], "2026-11-13").map((s) => s.id)).toEqual(["ok"]);
  });
  it("follows the order of the given groups", () => {
    const list = [c({ id: "x", groupId: "g1" }), c({ id: "y", groupId: "g2", date: "2026-11-14" })];
    expect(nextSessions(list, ["g2", "g1"], "2026-11-13").map((s) => s.id)).toEqual(["y", "x"]);
  });
});

describe("todayInStockholm", () => {
  it("uses the Swedish date, not UTC", () => {
    expect(todayInStockholm(new Date("2026-11-13T23:30:00Z"))).toBe("2026-11-14");
    expect(todayInStockholm(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(todayInStockholm(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });
});
