import { describe, expect, it } from "vitest";

import { canRedo, canUndo, commit, createHistory, redo, undo } from "./history";

describe("history", () => {
  it("undoes and redoes committed states in order", () => {
    let h = createHistory("a");
    expect(canUndo(h)).toBe(false);
    h = commit(h, "b");
    h = commit(h, "c");
    expect(h.present).toBe("c");
    h = undo(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
    h = undo(h);
    expect(h.present).toBe("a");
    expect(undo(h)).toBe(h);
    h = redo(h);
    h = redo(h);
    expect(h.present).toBe("c");
    expect(redo(h)).toBe(h);
  });

  it("drops what could be redone when something new is committed", () => {
    let h = commit(commit(createHistory(1), 2), 3);
    h = undo(h);
    h = commit(h, 4);
    expect(h.present).toBe(4);
    expect(canRedo(h)).toBe(false);
    expect(undo(h).present).toBe(2);
  });

  it("ignores committing the present and keeps at most the limit", () => {
    const state = { n: 1 };
    const h = createHistory(state);
    expect(commit(h, state)).toBe(h);
    let long = createHistory(0);
    for (let i = 1; i <= 10; i++) {
      long = commit(long, i, 3);
    }
    expect(long.past).toEqual([7, 8, 9]);
  });
});
