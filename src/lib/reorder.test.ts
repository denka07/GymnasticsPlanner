import { describe, expect, it } from "vitest";

import { moveStep, sortOrders } from "./reorder";

describe("moveStep", () => {
  const ids = ["a", "b", "c"];

  it("moves an item up", () => {
    expect(moveStep(ids, "b", "up")).toEqual(["b", "a", "c"]);
  });

  it("moves an item down", () => {
    expect(moveStep(ids, "b", "down")).toEqual(["a", "c", "b"]);
  });

  it("returns null at the top when moving up", () => {
    expect(moveStep(ids, "a", "up")).toBeNull();
  });

  it("returns null at the bottom when moving down", () => {
    expect(moveStep(ids, "c", "down")).toBeNull();
  });

  it("returns null for an unknown id", () => {
    expect(moveStep(ids, "x", "up")).toBeNull();
  });

  it("does not change the input", () => {
    const input = ["a", "b"];
    moveStep(input, "b", "up");
    expect(input).toEqual(["a", "b"]);
  });
});

describe("sortOrders", () => {
  it("numbers the ids from zero in order", () => {
    expect(sortOrders(["c", "a"])).toEqual([
      { id: "c", sortOrder: 0 },
      { id: "a", sortOrder: 1 },
    ]);
  });

  it("is empty for no ids", () => {
    expect(sortOrders([])).toEqual([]);
  });
});
