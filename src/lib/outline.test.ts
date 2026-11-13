import { describe, expect, it } from "vitest";

import {
  activity,
  applyPaste,
  ensureLines,
  formatTime,
  fromSavedParts,
  indent,
  isOutlinePaste,
  moveLine,
  outdent,
  parsePaste,
  part,
  partClockTimes,
  partIndexOf,
  pressEnter,
  removeEmptyLine,
  sessionLength,
  toSavedParts,
  totalDuration,
  type OutlineLine,
} from "./outline";

function ids() {
  let n = 0;
  return () => `n${++n}`;
}

/** Compact view: "P:title" / "  A:text". */
function show(lines: readonly OutlineLine[]): string[] {
  return lines.map((l) => (l.kind === "part" ? `P:${l.text}` : `  A:${l.text}`));
}

const sample: OutlineLine[] = [
  part("p1", "Samling", 10),
  part("p2", "Trampett", 30),
  activity("a1", "Volt"),
  activity("a2", "Skruv"),
  part("p3", "Airtrack"),
  activity("a3", "Fritt"),
];

describe("ensureLines", () => {
  it("gives an empty outline one empty part", () => {
    expect(ensureLines([], ids())).toEqual([part("n1", "")]);
  });
  it("puts a part above a leading activity", () => {
    expect(show(ensureLines([activity("a", "x")], ids()))).toEqual(["P:", "  A:x"]);
  });
  it("leaves a valid outline as it is", () => {
    expect(ensureLines(sample, ids())).toEqual(sample);
  });
});

describe("partIndexOf", () => {
  it("finds the part of a line", () => {
    expect(partIndexOf(sample, 3)).toBe(1);
    expect(partIndexOf(sample, 1)).toBe(1);
    expect(partIndexOf(sample, 5)).toBe(4);
  });
});

describe("pressEnter", () => {
  it("splits a part at the caret; the rest becomes the next part", () => {
    const r = pressEnter([part("p", "Samling", 5)], 0, 3, ids());
    expect(show(r.lines)).toEqual(["P:Sam", "P:ling"]);
    expect(r.lines[0].duration).toBe(5);
    expect(r.lines[1]).toEqual(part("n1", "ling"));
    expect(r.focus).toEqual({ index: 1, offset: 0 });
  });

  it("at the end of a part without activities creates the next part", () => {
    const r = pressEnter(sample, 0, 7, ids());
    expect(show(r.lines).slice(0, 3)).toEqual(["P:Samling", "P:", "P:Trampett"]);
    expect(r.focus).toEqual({ index: 1, offset: 0 });
  });

  it("at the end of a part with activities creates its first activity", () => {
    const r = pressEnter(sample, 1, 8, ids());
    expect(show(r.lines).slice(1, 5)).toEqual(["P:Trampett", "  A:", "  A:Volt", "  A:Skruv"]);
    expect(r.focus).toEqual({ index: 2, offset: 0 });
  });

  it("splitting a part with activities hands them to the new part", () => {
    const r = pressEnter(sample, 1, 4, ids());
    expect(show(r.lines).slice(1, 5)).toEqual(["P:Tram", "P:pett", "  A:Volt", "  A:Skruv"]);
  });

  it("at the start of a non-empty part inserts an empty part above", () => {
    const r = pressEnter(sample, 1, 0, ids());
    expect(show(r.lines).slice(0, 4)).toEqual(["P:Samling", "P:", "P:Trampett", "  A:Volt"]);
    expect(r.focus).toEqual({ index: 2, offset: 0 });
  });

  it("splits an activity into two activities", () => {
    const r = pressEnter(sample, 2, 2, ids());
    expect(show(r.lines).slice(1, 5)).toEqual(["P:Trampett", "  A:Vo", "  A:lt", "  A:Skruv"]);
    expect(r.focus).toEqual({ index: 3, offset: 0 });
  });

  it("at the end of an activity creates an empty activity", () => {
    const r = pressEnter(sample, 3, 5, ids());
    expect(show(r.lines).slice(3, 6)).toEqual(["  A:Skruv", "  A:", "P:Airtrack"]);
  });

  it("at the start of a non-empty activity inserts an empty activity above", () => {
    const r = pressEnter(sample, 2, 0, ids());
    expect(show(r.lines).slice(2, 4)).toEqual(["  A:", "  A:Volt"]);
    expect(r.focus).toEqual({ index: 3, offset: 0 });
  });

  it("on an empty activity turns it into a part", () => {
    const lines = [part("p", "Trampett"), activity("a", "Volt"), activity("b", "")];
    const r = pressEnter(lines, 2, 0, ids());
    expect(show(r.lines)).toEqual(["P:Trampett", "  A:Volt", "P:"]);
    expect(r.lines[2].id).toBe("b");
    expect(r.focus).toEqual({ index: 2, offset: 0 });
  });

  it("an empty activity in the middle becomes a part taking the activities below", () => {
    const lines = [part("p", "T"), activity("a", "x"), activity("b", ""), activity("c", "y")];
    expect(show(pressEnter(lines, 2, 0, ids()).lines)).toEqual(["P:T", "  A:x", "P:", "  A:y"]);
  });

  it("does not change its input", () => {
    const copy = structuredClone(sample);
    pressEnter(sample, 1, 4, ids());
    expect(sample).toEqual(copy);
  });
});

describe("indent", () => {
  it("turns a part into an activity of the part above, dropping its duration", () => {
    const r = indent(sample, 1, 2);
    expect(r).not.toBeNull();
    expect(show(r!.lines).slice(0, 4)).toEqual(["P:Samling", "  A:Trampett", "  A:Volt", "  A:Skruv"]);
    expect(r!.lines[1].duration).toBeNull();
    expect(r!.focus).toEqual({ index: 1, offset: 2 });
  });
  it("does nothing on the first part", () => {
    expect(indent(sample, 0, 0)).toBeNull();
  });
  it("does nothing on an activity", () => {
    expect(indent(sample, 2, 0)).toBeNull();
  });
});

describe("outdent", () => {
  it("turns an activity into a part, taking the activities below along", () => {
    const r = outdent(sample, 2, 1);
    expect(show(r!.lines).slice(1, 5)).toEqual(["P:Trampett", "P:Volt", "  A:Skruv", "P:Airtrack"]);
    expect(r!.lines[2]).toEqual(part("a1", "Volt"));
    expect(r!.focus).toEqual({ index: 2, offset: 1 });
  });
  it("on the last activity of a part leaves the others with their part", () => {
    const r = outdent(sample, 3, 0);
    expect(show(r!.lines).slice(1, 5)).toEqual(["P:Trampett", "  A:Volt", "P:Skruv", "P:Airtrack"]);
  });
  it("does nothing on a part", () => {
    expect(outdent(sample, 1, 0)).toBeNull();
  });
});

describe("removeEmptyLine", () => {
  it("removes an empty activity and goes to the end of the previous line", () => {
    const lines = [part("p", "Trampett"), activity("a", "Volt"), activity("b", "")];
    const r = removeEmptyLine(lines, 2);
    expect(show(r!.lines)).toEqual(["P:Trampett", "  A:Volt"]);
    expect(r!.focus).toEqual({ index: 1, offset: 4 });
  });
  it("removes an empty part; its activities join the part above", () => {
    const lines = [part("p", "Trampett"), part("e", ""), activity("a", "Volt")];
    const r = removeEmptyLine(lines, 1);
    expect(show(r!.lines)).toEqual(["P:Trampett", "  A:Volt"]);
    expect(r!.focus).toEqual({ index: 0, offset: 8 });
  });
  it("removes an empty first line when a part follows", () => {
    const r = removeEmptyLine([part("e", ""), part("p", "X")], 0);
    expect(show(r!.lines)).toEqual(["P:X"]);
    expect(r!.focus).toEqual({ index: 0, offset: 0 });
  });
  it("keeps an empty first part that has activities", () => {
    expect(removeEmptyLine([part("e", ""), activity("a", "x")], 0)).toBeNull();
  });
  it("keeps the only line", () => {
    expect(removeEmptyLine([part("e", "")], 0)).toBeNull();
  });
  it("does nothing on a line with text", () => {
    expect(removeEmptyLine(sample, 2)).toBeNull();
  });
});

describe("moveLine", () => {
  it("moves an activity within its part", () => {
    const r = moveLine(sample, 3, -1, 2);
    expect(show(r!.lines).slice(1, 4)).toEqual(["P:Trampett", "  A:Skruv", "  A:Volt"]);
    expect(r!.focus).toEqual({ index: 2, offset: 2 });
  });
  it("moves the first activity up into the part above, as its last", () => {
    const r = moveLine(sample, 5, -1, 0);
    expect(show(r!.lines).slice(1, 6)).toEqual(["P:Trampett", "  A:Volt", "  A:Skruv", "  A:Fritt", "P:Airtrack"]);
    expect(r!.focus.index).toBe(4);
  });
  it("moves the last activity down into the next part, as its first", () => {
    const r = moveLine(sample, 3, 1, 0);
    expect(show(r!.lines).slice(1, 6)).toEqual(["P:Trampett", "  A:Volt", "P:Airtrack", "  A:Skruv", "  A:Fritt"]);
    expect(r!.focus.index).toBe(4);
  });
  it("does not move an activity above the first part", () => {
    const lines = [part("p", "T"), activity("a", "x")];
    expect(moveLine(lines, 1, -1, 0)).toBeNull();
  });
  it("does not move the last line down", () => {
    expect(moveLine(sample, 5, 1, 0)).toBeNull();
  });
  it("moves a part up together with its activities", () => {
    const r = moveLine(sample, 4, -1, 3);
    expect(show(r!.lines)).toEqual(["P:Samling", "P:Airtrack", "  A:Fritt", "P:Trampett", "  A:Volt", "  A:Skruv"]);
    expect(r!.focus).toEqual({ index: 1, offset: 3 });
  });
  it("moves a part down past the next part and its activities", () => {
    const r = moveLine(sample, 1, 1, 0);
    expect(show(r!.lines)).toEqual(["P:Samling", "P:Airtrack", "  A:Fritt", "P:Trampett", "  A:Volt", "  A:Skruv"]);
    expect(r!.focus.index).toBe(3);
  });
  it("moves the first part down", () => {
    const r = moveLine(sample, 0, 1, 0);
    expect(show(r!.lines).slice(0, 4)).toEqual(["P:Trampett", "  A:Volt", "  A:Skruv", "P:Samling"]);
    expect(r!.focus.index).toBe(3);
    expect(r!.lines[3].duration).toBe(10);
  });
  it("does not move the first part up or the last part down", () => {
    expect(moveLine(sample, 0, -1, 0)).toBeNull();
    expect(moveLine(sample, 4, 1, 0)).toBeNull();
  });
});

const SHEET =
  "• Uppvärmning: Övningar från styrkeprogram\n• Mjukning\n• Trampett\n• Paus\n• Airtrack\n\nTrampett\n• Trampett till tävlingslandning (+ filma ström 3 varv)\n• Styrkeövning från program\n• Fristående-länga\n\nAirtrack\n• Fritt airtrack (öva tävlingsvarv)\n• Styrkeövning från program\n• Friståendelänga";

describe("parsePaste", () => {
  it("reads agenda entries as parts and headings with their bulleted activities", () => {
    expect(parsePaste(SHEET)).toEqual([
      { title: "Uppvärmning: Övningar från styrkeprogram", activities: [], heading: false },
      { title: "Mjukning", activities: [], heading: false },
      { title: "Trampett", activities: [], heading: false },
      { title: "Paus", activities: [], heading: false },
      { title: "Airtrack", activities: [], heading: false },
      {
        title: "Trampett",
        heading: true,
        activities: [
          "Trampett till tävlingslandning (+ filma ström 3 varv)",
          "Styrkeövning från program",
          "Fristående-länga",
        ],
      },
      {
        title: "Airtrack",
        heading: true,
        activities: ["Fritt airtrack (öva tävlingsvarv)", "Styrkeövning från program", "Friståendelänga"],
      },
    ]);
  });

  it("accepts -, * and numbered bullets and Windows line ends", () => {
    expect(parsePaste("Stationer\r\n- ett\r\n* två\r\n1. tre\r\n12) fyra")).toEqual([
      { title: "Stationer", heading: true, activities: ["ett", "två", "tre", "fyra"] },
    ]);
  });

  it("does not read a hyphenated word as a bullet", () => {
    expect(parsePaste("Rubrik\n-5 grader")).toEqual([
      { title: "Rubrik", heading: true, activities: [] },
      { title: "-5 grader", heading: true, activities: [] },
    ]);
  });

  it("accepts a bullet without a space and skips empty bullets and blank lines", () => {
    expect(parsePaste("\n\n•Samling\n•\n  \nPaus")).toEqual([
      { title: "Samling", heading: false, activities: [] },
      { title: "Paus", heading: true, activities: [] },
    ]);
  });

  it("returns nothing for blank text", () => {
    expect(parsePaste(" \n\n ")).toEqual([]);
  });
});

describe("isOutlinePaste", () => {
  it("is true only for several non-empty lines", () => {
    expect(isOutlinePaste("one line")).toBe(false);
    expect(isOutlinePaste("one\n\n")).toBe(false);
    expect(isOutlinePaste("one\ntwo")).toBe(true);
  });
});

describe("applyPaste", () => {
  it("fills an empty outline and merges headings into the agenda without duplicates", () => {
    const r = applyPaste([part("e", "")], 0, parsePaste(SHEET), ids());
    expect(show(r!.lines)).toEqual([
      "P:Uppvärmning: Övningar från styrkeprogram",
      "P:Mjukning",
      "P:Trampett",
      "  A:Trampett till tävlingslandning (+ filma ström 3 varv)",
      "  A:Styrkeövning från program",
      "  A:Fristående-länga",
      "P:Paus",
      "P:Airtrack",
      "  A:Fritt airtrack (öva tävlingsvarv)",
      "  A:Styrkeövning från program",
      "  A:Friståendelänga",
    ]);
    expect(r!.focus).toEqual({ index: 10, offset: "Friståendelänga".length });
  });

  it("adds a heading's activities to an existing part, case-insensitively", () => {
    const r = applyPaste(sample, 0, parsePaste("  trampett \n• Ny övning"), ids());
    expect(show(r!.lines)).toEqual([
      "P:Samling",
      "P:Trampett",
      "  A:Volt",
      "  A:Skruv",
      "  A:Ny övning",
      "P:Airtrack",
      "  A:Fritt",
    ]);
    expect(r!.focus).toEqual({ index: 4, offset: 9 });
  });

  it("inserts new parts after the block the caret is in", () => {
    const r = applyPaste(sample, 2, parsePaste("Bom\n• Gå"), ids());
    expect(show(r!.lines)).toEqual([
      "P:Samling",
      "P:Trampett",
      "  A:Volt",
      "  A:Skruv",
      "P:Bom",
      "  A:Gå",
      "P:Airtrack",
      "  A:Fritt",
    ]);
  });

  it("replaces the empty activity the caret is on", () => {
    const lines = [part("p", "T"), activity("a", ""), part("q", "U")];
    const r = applyPaste(lines, 1, parsePaste("• X\n• Y"), ids());
    expect(show(r!.lines)).toEqual(["P:T", "P:X", "P:Y", "P:U"]);
  });

  it("replaces an empty part in the middle", () => {
    const lines = [part("p", "T"), part("e", ""), part("q", "U")];
    const r = applyPaste(lines, 1, parsePaste("• X\n• Y"), ids());
    expect(show(r!.lines)).toEqual(["P:T", "P:X", "P:Y", "P:U"]);
  });

  it("keeps an empty part that holds activities", () => {
    const lines = [part("e", ""), activity("a", "x")];
    const r = applyPaste(lines, 0, parsePaste("• X\n• Y"), ids());
    expect(show(r!.lines)).toEqual(["P:", "  A:x", "P:X", "P:Y"]);
  });

  it("keeps ids of existing lines", () => {
    const r = applyPaste(sample, 0, parsePaste("Trampett\n• Ny"), ids());
    expect(r!.lines.filter((l) => l.id.startsWith("n")).map((l) => l.text)).toEqual(["Ny"]);
  });

  it("returns null for nothing to paste", () => {
    expect(applyPaste(sample, 0, [], ids())).toBeNull();
  });
});

describe("clock times", () => {
  it("advances by the durations", () => {
    expect(partClockTimes("17:00:00", [10, 30, 5])).toEqual(["17:00", "17:10", "17:40"]);
  });
  it("stops after the first part without a duration", () => {
    expect(partClockTimes("17:00", [10, null, 5, 5])).toEqual(["17:00", "17:10", null, null]);
  });
  it("shows nothing without a start time", () => {
    expect(partClockTimes(null, [10, 20])).toEqual([null, null]);
  });
  it("wraps past midnight", () => {
    expect(partClockTimes("23:50", [20, 5])).toEqual(["23:50", "00:10"]);
    expect(formatTime(-10)).toBe("23:50");
  });
  it("sums known durations", () => {
    expect(totalDuration([10, null, 25])).toBe(35);
    expect(totalDuration([null, null])).toBeNull();
    expect(totalDuration([])).toBeNull();
  });
  it("gives the session length when start and end are known", () => {
    expect(sessionLength("17:00:00", "19:00:00")).toBe(120);
    expect(sessionLength("17:00", null)).toBeNull();
    expect(sessionLength("19:00", "17:00")).toBeNull();
    expect(sessionLength("bad", "17:00")).toBeNull();
  });
});

describe("saved parts", () => {
  it("nests, trims and leaves out empty lines", () => {
    const lines = [
      part("p1", " Samling ", 10),
      activity("a0", "  "),
      part("p2", ""),
      part("p3", ""),
      activity("a1", " Volt "),
    ];
    expect(toSavedParts(lines)).toEqual([
      { id: "p1", title: "Samling", durationMinutes: 10, activities: [] },
      { id: "p3", title: "", durationMinutes: null, activities: [{ id: "a1", text: "Volt" }] },
    ]);
  });
  it("round-trips through the flat lines", () => {
    expect(fromSavedParts(toSavedParts(sample))).toEqual(sample);
  });
});
