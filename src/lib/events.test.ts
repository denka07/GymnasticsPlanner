import { describe, expect, it } from "vitest";

import type { EventType } from "@/db/schema";

import { eventColumns, layoutEventRows } from "./events";
import { weeksBetween } from "./weeks";

// Weeks 34-50 of 2026: Mondays 2026-08-17 ... 2026-12-07.
const weeks = weeksBetween("2026-08-17", "2026-12-07");
const col = (monday: string) => weeks.indexOf(monday);

describe("eventColumns", () => {
  it("places a one-day event in its week", () => {
    // Tuesday 2026-10-20 is in week 43 (Monday 2026-10-19).
    const c = col("2026-10-19");
    expect(eventColumns(weeks, "2026-10-20", "2026-10-20")).toEqual({ startCol: c, endCol: c });
  });

  it("covers every week an event touches", () => {
    expect(eventColumns(weeks, "2026-11-01", "2026-11-03")).toEqual({
      startCol: col("2026-10-26"),
      endCol: col("2026-11-02"),
    });
  });

  it("treats Sunday as part of the week that ends on it", () => {
    expect(eventColumns(weeks, "2026-10-25", "2026-10-25")).toEqual({
      startCol: col("2026-10-19"),
      endCol: col("2026-10-19"),
    });
  });

  it("clips an event that starts before the first week", () => {
    expect(eventColumns(weeks, "2026-08-01", "2026-08-18")).toEqual({ startCol: 0, endCol: 0 });
  });

  it("clips an event that ends after the last week", () => {
    expect(eventColumns(weeks, "2026-12-10", "2026-12-30")).toEqual({
      startCol: weeks.length - 1,
      endCol: weeks.length - 1,
    });
  });

  it("clips an event that covers the whole season", () => {
    expect(eventColumns(weeks, "2026-01-01", "2027-01-01")).toEqual({
      startCol: 0,
      endCol: weeks.length - 1,
    });
  });

  it("returns null for events entirely outside the weeks", () => {
    expect(eventColumns(weeks, "2026-08-01", "2026-08-16")).toBeNull();
    expect(eventColumns(weeks, "2026-12-14", "2026-12-15")).toBeNull();
  });
});

const ev = (name: string, type: EventType, startDate: string, endDate = startDate) => ({
  name,
  type,
  startDate,
  endDate,
});

describe("layoutEventRows", () => {
  it("orders rows Tävling, Läger, Uppvisning, Övrigt and skips empty types", () => {
    const rows = layoutEventRows(weeks, [
      ev("Annat", "other", "2026-09-01"),
      ev("Show", "show", "2026-12-02"),
      ev("Falun", "competition", "2026-10-20"),
    ]);
    expect(rows.map((r) => r.type)).toEqual(["competition", "show", "other"]);
  });

  it("puts events that do not collide in one lane", () => {
    const rows = layoutEventRows(weeks, [
      ev("Gävle", "competition", "2026-11-24"),
      ev("Falun", "competition", "2026-10-20"),
      ev("Nordfemman", "competition", "2026-11-03"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].lanes).toHaveLength(1);
    expect(rows[0].lanes[0].map((p) => p.event.name)).toEqual(["Falun", "Nordfemman", "Gävle"]);
  });

  it("puts events that overlap in weeks in separate lanes", () => {
    const rows = layoutEventRows(weeks, [
      ev("A", "camp", "2026-10-19", "2026-10-27"),
      ev("B", "camp", "2026-10-27"),
    ]);
    expect(rows[0].lanes.map((l) => l.map((p) => p.event.name))).toEqual([["A"], ["B"]]);
  });

  it("puts a long label that would run into the next event in another lane", () => {
    const rows = layoutEventRows(weeks, [
      ev("Mycket långt lägernamn", "camp", "2026-10-19"),
      ev("Kort", "camp", "2026-10-26"),
    ]);
    expect(rows[0].lanes).toHaveLength(2);
  });

  it("omits events outside the weeks and their type", () => {
    expect(layoutEventRows(weeks, [ev("Förra året", "show", "2025-05-01")])).toEqual([]);
  });
});
