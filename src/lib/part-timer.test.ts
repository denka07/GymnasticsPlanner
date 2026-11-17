import { describe, expect, it } from "vitest";

import {
  addMinute,
  clockTime,
  countdownTimer,
  formatRemaining,
  MAX_AHEAD_MS,
  minutesSinceEnd,
  parseMinutes,
  parseStoredTimer,
  plannedEnd,
  planTimer,
  remainingMs,
  serializeTimer,
  STALE_AFTER_MS,
  timerStorageKey,
  zonedMoment,
} from "./part-timer";

const MIN = 60_000;

describe("zonedMoment", () => {
  it("reads a Swedish wall time in summer (UTC+2) and winter (UTC+1)", () => {
    expect(new Date(zonedMoment("2026-08-31", 17 * 60)!).toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(new Date(zonedMoment("2026-11-17", 17 * 60)!).toISOString()).toBe("2026-11-17T16:00:00.000Z");
  });
  it("runs past midnight into the next day", () => {
    expect(new Date(zonedMoment("2026-11-17", 24 * 60 + 30)!).toISOString()).toBe("2026-11-17T23:30:00.000Z");
  });
  it("handles the day daylight saving ends", () => {
    // 25 October 2026: clocks go back from 03:00 to 02:00.
    expect(new Date(zonedMoment("2026-10-25", 17 * 60)!).toISOString()).toBe("2026-10-25T16:00:00.000Z");
    expect(new Date(zonedMoment("2026-10-25", 60)!).toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });
  it("rejects a malformed date", () => {
    expect(zonedMoment("31/8", 0)).toBeNull();
  });
});

describe("plannedEnd", () => {
  const durations = [15, 45, null, 30];
  it("adds the durations up to and including the part to the start time", () => {
    expect(clockTime(plannedEnd("2026-08-31", "17:00:00", durations, 0)!)).toBe("17:15");
    expect(clockTime(plannedEnd("2026-08-31", "17:00", durations, 1)!)).toBe("18:00");
  });
  it("is null when a duration up to the part, or the start time, is missing", () => {
    expect(plannedEnd("2026-08-31", "17:00", durations, 2)).toBeNull();
    expect(plannedEnd("2026-08-31", "17:00", durations, 3)).toBeNull();
    expect(plannedEnd("2026-08-31", null, durations, 0)).toBeNull();
    expect(plannedEnd("2026-08-31", "17:00", durations, 9)).toBeNull();
  });
});

describe("remaining time", () => {
  it("is never negative", () => {
    expect(remainingMs(1000, 500)).toBe(500);
    expect(remainingMs(1000, 5000)).toBe(0);
  });
  it("formats as mm:ss rounded up to whole seconds", () => {
    expect(formatRemaining(15 * MIN)).toBe("15:00");
    expect(formatRemaining(14 * MIN + 59_001)).toBe("15:00");
    expect(formatRemaining(61_000)).toBe("01:01");
    expect(formatRemaining(1)).toBe("00:01");
    expect(formatRemaining(0)).toBe("00:00");
    expect(formatRemaining(-5)).toBe("00:00");
    expect(formatRemaining(90 * MIN)).toBe("90:00");
  });
  it("counts whole minutes since the time ran out", () => {
    expect(minutesSinceEnd(10 * MIN, 10 * MIN + 59_000)).toBe(0);
    expect(minutesSinceEnd(10 * MIN, 13 * MIN + 1)).toBe(3);
    expect(minutesSinceEnd(10 * MIN, 0)).toBe(0);
  });
});

describe("parseMinutes", () => {
  it("accepts whole minutes in range", () => {
    expect(parseMinutes(" 15 ")).toBe(15);
    expect(parseMinutes("1")).toBe(1);
    expect(parseMinutes("600")).toBe(600);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "0", "601", "1.5", "-3", "tio", "1e2"]) {
      expect(parseMinutes(bad)).toBeNull();
    }
  });
});

describe("starting and extending", () => {
  it("starts a countdown from now", () => {
    expect(countdownTimer("p1", 15, 1000)).toEqual({
      partId: "p1",
      mode: "countdown",
      endsAt: 1000 + 15 * MIN,
      rang: false,
      notified: false,
    });
  });
  it("does not start a plan timer whose end has passed", () => {
    expect(planTimer("p1", 1000, 1000)).toBeNull();
    expect(planTimer("p1", 2000, 1000)?.endsAt).toBe(2000);
  });
  it("adds a minute to the end, or to now once the time is up", () => {
    const t = countdownTimer("p1", 5, 0);
    expect(addMinute(t, MIN).endsAt).toBe(6 * MIN);
    const late = { ...t, rang: true, notified: true };
    expect(addMinute(late, 7 * MIN)).toMatchObject({ endsAt: 8 * MIN, rang: false, notified: false });
  });
});

describe("parseStoredTimer", () => {
  const now = 1_800_000_000_000;
  const timer = { ...countdownTimer("p1", 10, now), rang: true };
  it("reads back what was stored", () => {
    expect(parseStoredTimer(serializeTimer(timer), now)).toEqual(timer);
    expect(timerStorageKey("s1")).toBe("part-timer:s1");
  });
  it("ignores missing and corrupt values", () => {
    for (const raw of [null, undefined, "", "{", "null", "42", "[]", '{"partId":"p1"}']) {
      expect(parseStoredTimer(raw, now)).toBeNull();
    }
    expect(parseStoredTimer(JSON.stringify({ ...timer, mode: "other" }), now)).toBeNull();
    expect(parseStoredTimer(JSON.stringify({ ...timer, endsAt: "soon" }), now)).toBeNull();
    expect(parseStoredTimer(JSON.stringify({ ...timer, partId: "" }), now)).toBeNull();
  });
  it("keeps a recently expired timer but forgets one that expired long ago", () => {
    const recent = { ...timer, endsAt: now - 5 * MIN };
    expect(parseStoredTimer(JSON.stringify(recent), now)).toEqual(recent);
    const old = { ...timer, endsAt: now - STALE_AFTER_MS - 1 };
    expect(parseStoredTimer(JSON.stringify(old), now)).toBeNull();
    const far = { ...timer, endsAt: now + MAX_AHEAD_MS + 1 };
    expect(parseStoredTimer(JSON.stringify(far), now)).toBeNull();
  });
  it("treats missing flags as false", () => {
    const raw = JSON.stringify({ partId: "p1", mode: "plan", endsAt: now });
    expect(parseStoredTimer(raw, now)).toEqual({ partId: "p1", mode: "plan", endsAt: now, rang: false, notified: false });
  });
});
