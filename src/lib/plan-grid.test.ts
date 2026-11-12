import { describe, expect, it } from "vitest";

import {
  categorySpans,
  cellKey,
  clickLevel,
  commitStroke,
  finishSave,
  initialState,
  isDirty,
  keyLevel,
  levelOf,
  moveFocus,
  paintCell,
  parseCellKey,
  pendingChanges,
  startSave,
  undo,
  type CellKey,
  type CellLevel,
  type GridState,
  type Stroke,
} from "./plan-grid";

const A = "item-a";
const B = "item-b";
const W1 = "2026-08-17";
const W2 = "2026-08-24";
const W3 = "2026-08-31";

const a1 = cellKey(A, W1);
const a2 = cellKey(A, W2);
const a3 = cellKey(A, W3);
const b1 = cellKey(B, W1);

/** Paints the cells in order as one stroke and commits it. */
function stroke(state: GridState, cells: [CellKey, CellLevel][]): GridState {
  let s = state;
  let st: Stroke = [];
  for (const [key, level] of cells) {
    ({ state: s, stroke: st } = paintCell(s, st, key, level));
  }
  return commitStroke(s, st);
}

const start = () => initialState([{ focusItemId: A, weekStart: W1, level: "low" }]);

describe("cell keys", () => {
  it("round-trips", () => {
    expect(parseCellKey(cellKey("3f1c2a4e-5b6d", "2026-08-17"))).toEqual({
      focusItemId: "3f1c2a4e-5b6d",
      weekStart: "2026-08-17",
    });
  });
});

describe("initialState", () => {
  it("indexes allocations; current and saved agree", () => {
    const s = start();
    expect(levelOf(s.current, a1)).toBe("low");
    expect(levelOf(s.current, a2)).toBeNull();
    expect(pendingChanges(s)).toEqual([]);
    expect(isDirty(s)).toBe(false);
  });
});

describe("clickLevel", () => {
  it("paints with the brush, or clears a cell that already has it", () => {
    expect(clickLevel(null, "high")).toBe("high");
    expect(clickLevel("low", "high")).toBe("high");
    expect(clickLevel("high", "high")).toBeNull();
    expect(clickLevel("high", null)).toBeNull();
    expect(clickLevel(null, null)).toBeNull();
  });
});

describe("strokes", () => {
  it("paints several cells, across rows, as one undo step", () => {
    const s = stroke(start(), [
      [a1, "high"],
      [a2, "high"],
      [b1, "high"],
    ]);
    expect(levelOf(s.current, a1)).toBe("high");
    expect(levelOf(s.current, b1)).toBe("high");
    expect(s.undo).toHaveLength(1);
    expect(s.undo[0]).toEqual([
      { key: a1, before: "low", after: "high" },
      { key: a2, before: null, after: "high" },
      { key: b1, before: null, after: "high" },
    ]);
  });

  it("keeps the first before-level when a stroke touches a cell twice", () => {
    let s = start();
    let st: Stroke = [];
    ({ state: s, stroke: st } = paintCell(s, st, a1, "high"));
    ({ state: s, stroke: st } = paintCell(s, st, a1, "medium"));
    expect(st).toEqual([{ key: a1, before: "low", after: "medium" }]);
  });

  it("ignores cells that already have the level", () => {
    const s0 = start();
    const { state, stroke: st } = paintCell(s0, [], a1, "low");
    expect(state).toBe(s0);
    expect(st).toEqual([]);
    expect(commitStroke(state, st)).toBe(s0);
  });

  it("does not record a stroke that ends where it began", () => {
    const s = stroke(start(), [
      [a1, "high"],
      [a1, "low"],
    ]);
    expect(s.undo).toEqual([]);
  });

  it("clears cells", () => {
    const s = stroke(start(), [[a1, null]]);
    expect(levelOf(s.current, a1)).toBeNull();
    expect(a1 in s.current).toBe(false);
  });
});

describe("undo", () => {
  it("undoes the last stroke, then the one before", () => {
    let s = stroke(start(), [[a1, "high"], [a2, "high"]]);
    s = stroke(s, [[a2, "medium"], [a3, "medium"]]);
    s = undo(s);
    expect(levelOf(s.current, a2)).toBe("high");
    expect(levelOf(s.current, a3)).toBeNull();
    s = undo(s);
    expect(levelOf(s.current, a1)).toBe("low");
    expect(levelOf(s.current, a2)).toBeNull();
    expect(s.undo).toEqual([]);
    expect(pendingChanges(s)).toEqual([]);
  });

  it("does nothing with an empty stack", () => {
    const s = start();
    expect(undo(s)).toBe(s);
  });
});

describe("pendingChanges", () => {
  it("lists only cells whose level differs from the saved one", () => {
    let s = stroke(start(), [[a1, "high"], [a2, "medium"]]);
    s = stroke(s, [[a2, null]]); // back to what is saved
    s = stroke(s, [[b1, "low"]]);
    expect(pendingChanges(s)).toEqual([
      { focusItemId: A, weekStart: W1, level: "high" },
      { focusItemId: B, weekStart: W1, level: "low" },
    ]);
  });

  it("lists cleared cells with level null", () => {
    const s = stroke(start(), [[a1, null]]);
    expect(pendingChanges(s)).toEqual([{ focusItemId: A, weekStart: W1, level: null }]);
  });
});

describe("saving", () => {
  it("sends the pending changes and saves them on success", () => {
    const s = stroke(start(), [[a1, "high"], [a2, "high"]]);
    const started = startSave(s);
    expect(started?.batch).toHaveLength(2);
    expect(isDirty(started!.state)).toBe(true);
    const { state, reverted } = finishSave(started!.state, true);
    expect(reverted).toEqual([]);
    expect(levelOf(state.saved, a1)).toBe("high");
    expect(state.inFlight).toBeNull();
    expect(isDirty(state)).toBe(false);
  });

  it("returns null with nothing to save", () => {
    expect(startSave(start())).toBeNull();
  });

  it("does not start a second batch while one is in flight", () => {
    const s = stroke(start(), [[a1, "high"]]);
    const started = startSave(s)!;
    const later = stroke(started.state, [[a2, "low"]]);
    expect(startSave(later)).toBeNull();
  });

  it("sends a stroke made during a save with the next batch", () => {
    let s = stroke(start(), [[a1, "high"]]);
    const first = startSave(s)!;
    s = stroke(first.state, [[a2, "low"], [a1, "medium"]]);
    s = finishSave(s, true).state;
    expect(levelOf(s.saved, a1)).toBe("high");
    expect(levelOf(s.current, a1)).toBe("medium");
    const second = startSave(s)!;
    expect(second.batch).toEqual([
      { focusItemId: A, weekStart: W1, level: "medium" },
      { focusItemId: A, weekStart: W2, level: "low" },
    ]);
    s = finishSave(second.state, true).state;
    expect(isDirty(s)).toBe(false);
  });

  it("reverts a failed batch to the saved levels", () => {
    const s = stroke(start(), [[a1, "high"], [a2, "high"]]);
    const started = startSave(s)!;
    const { state, reverted } = finishSave(started.state, false);
    expect(reverted).toEqual([a1, a2]);
    expect(levelOf(state.current, a1)).toBe("low");
    expect(levelOf(state.current, a2)).toBeNull();
    expect(isDirty(state)).toBe(false);
  });

  it("keeps cells changed again after a failed batch was sent", () => {
    let s = stroke(start(), [[a1, "high"], [a2, "high"]]);
    const started = startSave(s)!;
    s = stroke(started.state, [[a2, "medium"], [a3, "low"]]);
    const { state, reverted } = finishSave(s, false);
    expect(reverted).toEqual([a1]);
    expect(levelOf(state.current, a1)).toBe("low");
    expect(levelOf(state.current, a2)).toBe("medium");
    expect(startSave(state)!.batch).toEqual([
      { focusItemId: A, weekStart: W2, level: "medium" },
      { focusItemId: A, weekStart: W3, level: "low" },
    ]);
  });

  it("ignores finishSave without a batch in flight", () => {
    const s = start();
    expect(finishSave(s, true).state).toBe(s);
  });
});

describe("categorySpans", () => {
  it("groups consecutive items with the same category", () => {
    expect(
      categorySpans([
        { category: "Redskap" },
        { category: "Redskap" },
        { category: "Landing" },
        { category: null },
        { category: null },
        { category: "Redskap" },
      ]),
    ).toEqual([2, 0, 1, 1, 1, 1]);
  });

  it("handles empty lists", () => {
    expect(categorySpans([])).toEqual([]);
  });
});

describe("moveFocus", () => {
  it("moves with arrow keys and stops at the edges", () => {
    expect(moveFocus({ row: 0, col: 0 }, "ArrowRight", 3, 4)).toEqual({ row: 0, col: 1 });
    expect(moveFocus({ row: 0, col: 0 }, "ArrowLeft", 3, 4)).toEqual({ row: 0, col: 0 });
    expect(moveFocus({ row: 2, col: 3 }, "ArrowDown", 3, 4)).toEqual({ row: 2, col: 3 });
    expect(moveFocus({ row: 2, col: 3 }, "ArrowUp", 3, 4)).toEqual({ row: 1, col: 3 });
  });

  it("jumps with Home and End", () => {
    expect(moveFocus({ row: 1, col: 2 }, "Home", 3, 4)).toEqual({ row: 1, col: 0 });
    expect(moveFocus({ row: 1, col: 2 }, "End", 3, 4)).toEqual({ row: 1, col: 3 });
    expect(moveFocus({ row: 1, col: 2 }, "End", 3, 4, true)).toEqual({ row: 2, col: 3 });
  });

  it("ignores other keys", () => {
    expect(moveFocus({ row: 0, col: 0 }, "a", 3, 4)).toBeNull();
  });
});

describe("keyLevel", () => {
  it("maps digits, clear keys and the brush keys", () => {
    expect(keyLevel("1", null)).toBe("high");
    expect(keyLevel("2", null)).toBe("medium");
    expect(keyLevel("3", null)).toBe("low");
    expect(keyLevel("0", "high")).toBeNull();
    expect(keyLevel("Delete", "high")).toBeNull();
    expect(keyLevel("Backspace", "high")).toBeNull();
    expect(keyLevel(" ", "medium")).toBe("medium");
    expect(keyLevel("Enter", null)).toBeNull();
    expect(keyLevel("x", "high")).toBeUndefined();
  });
});
