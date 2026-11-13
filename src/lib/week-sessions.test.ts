import { describe, expect, it } from "vitest";

import { weekSessions, type SlotLike } from "./week-sessions";

const MON = "2026-08-31"; // week 36

const slots: SlotLike[] = [
  { id: "sun", weekday: 7, startTime: "10:00:00", endTime: null, location: null },
  { id: "mon", weekday: 1, startTime: "17:00:00", endTime: "19:00:00", location: "Hallen" },
  { id: "wed", weekday: 3, startTime: null, endTime: null, location: null },
];

function stored(id: string, date: string, slot: string | null, startTime: string | null = null) {
  return { id, date, startTime, trainingSlotId: slot };
}

function describeEntries(entries: ReturnType<typeof weekSessions>) {
  return entries.map((e) =>
    e.kind === "stored" ? `S:${e.session.id}@${e.session.date}` : `P:${e.placeholder.trainingSlotId}@${e.placeholder.date}`,
  );
}

describe("weekSessions", () => {
  it("gives a placeholder per slot with the slot's date, times and location", () => {
    const entries = weekSessions(slots, MON, false, []);
    expect(describeEntries(entries)).toEqual([
      "P:mon@2026-08-31",
      "P:wed@2026-09-02",
      "P:sun@2026-09-06",
    ]);
    expect(entries[0]).toEqual({
      kind: "placeholder",
      placeholder: {
        trainingSlotId: "mon",
        date: "2026-08-31",
        startTime: "17:00:00",
        endTime: "19:00:00",
        location: "Hallen",
      },
    });
  });

  it("replaces a slot's placeholder with its stored session", () => {
    const entries = weekSessions(slots, MON, false, [stored("a", "2026-08-31", "mon", "18:00:00")]);
    expect(describeEntries(entries)).toEqual(["S:a@2026-08-31", "P:wed@2026-09-02", "P:sun@2026-09-06"]);
  });

  it("matches by slot and week even when the stored session moved to another day", () => {
    const entries = weekSessions(slots, MON, false, [stored("a", "2026-09-01", "mon")]);
    expect(describeEntries(entries)).toEqual(["S:a@2026-09-01", "P:wed@2026-09-02", "P:sun@2026-09-06"]);
  });

  it("does not let a session of another week hide a placeholder", () => {
    const entries = weekSessions(slots, MON, false, [stored("old", "2026-08-24", "mon")]);
    expect(describeEntries(entries)).toEqual(["P:mon@2026-08-31", "P:wed@2026-09-02", "P:sun@2026-09-06"]);
  });

  it("keeps extra sessions and orders by date, then time, untimed last", () => {
    const entries = weekSessions(slots, MON, false, [
      stored("x2", "2026-08-31", null),
      stored("x1", "2026-08-31", null, "08:00:00"),
      stored("tue", "2026-09-01", null, "12:00:00"),
    ]);
    expect(describeEntries(entries)).toEqual([
      "S:x1@2026-08-31",
      "P:mon@2026-08-31",
      "S:x2@2026-08-31",
      "S:tue@2026-09-01",
      "P:wed@2026-09-02",
      "P:sun@2026-09-06",
    ]);
  });

  it("puts a stored session before a placeholder at the same date and time", () => {
    const entries = weekSessions(slots, MON, false, [stored("x", "2026-08-31", null, "17:00:00")]);
    expect(describeEntries(entries).slice(0, 2)).toEqual(["S:x@2026-08-31", "P:mon@2026-08-31"]);
  });

  it("gives a break week no placeholders but keeps its stored sessions", () => {
    expect(weekSessions(slots, MON, true, [])).toEqual([]);
    const entries = weekSessions(slots, MON, true, [stored("a", "2026-09-02", "wed")]);
    expect(describeEntries(entries)).toEqual(["S:a@2026-09-02"]);
  });

  it("treats a session whose slot was deleted as an extra session", () => {
    const entries = weekSessions(slots, MON, false, [stored("a", "2026-08-31", "gone")]);
    expect(describeEntries(entries)).toEqual([
      "P:mon@2026-08-31",
      "S:a@2026-08-31",
      "P:wed@2026-09-02",
      "P:sun@2026-09-06",
    ]);
  });

  it("returns nothing without slots or sessions", () => {
    expect(weekSessions([], MON, false, [])).toEqual([]);
  });
});
