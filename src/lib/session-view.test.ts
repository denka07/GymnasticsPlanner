import { describe, expect, it } from "vitest";

import { neighbours, progress, todayInStockholm } from "./session-view";

describe("progress", () => {
  it("counts ticked parts out of all parts", () => {
    expect(progress([])).toEqual({ done: 0, total: 0 });
    expect(progress([{ isDone: true }, { isDone: false }, { isDone: true }])).toEqual({ done: 2, total: 3 });
  });
  it("counts parts only, however many activities they have", () => {
    const parts = [{ isDone: false, activities: [{}, {}, {}] }];
    expect(progress(parts)).toEqual({ done: 0, total: 1 });
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

describe("todayInStockholm", () => {
  it("uses the Swedish date, not UTC", () => {
    expect(todayInStockholm(new Date("2026-11-13T23:30:00Z"))).toBe("2026-11-14");
    expect(todayInStockholm(new Date("2026-07-01T21:59:00Z"))).toBe("2026-07-01");
    expect(todayInStockholm(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
  });
});
