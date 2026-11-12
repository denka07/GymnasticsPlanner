import { describe, expect, it } from "vitest";

import { canEdit, canView, isUuid, meetsMinimum } from "./levels";

describe("canEdit / canView", () => {
  it("lets owner and edit change content", () => {
    expect(canEdit("owner")).toBe(true);
    expect(canEdit("edit")).toBe(true);
    expect(canEdit("view")).toBe(false);
    expect(canEdit(null)).toBe(false);
  });
  it("lets every level read", () => {
    expect(canView("owner")).toBe(true);
    expect(canView("edit")).toBe(true);
    expect(canView("view")).toBe(true);
    expect(canView(null)).toBe(false);
  });
});

describe("meetsMinimum", () => {
  it("compares levels", () => {
    expect(meetsMinimum("owner", "edit")).toBe(true);
    expect(meetsMinimum("edit", "edit")).toBe(true);
    expect(meetsMinimum("view", "edit")).toBe(false);
    expect(meetsMinimum("view", "view")).toBe(true);
    expect(meetsMinimum("edit", "view")).toBe(true);
  });
  it("never accepts no access", () => {
    expect(meetsMinimum(null, "view")).toBe(false);
    expect(meetsMinimum(null, "edit")).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts UUIDs", () => {
    expect(isUuid("3f2b8c1e-5d4a-4e7b-9a10-0c2d3e4f5a6b")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isUuid("")).toBe(false);
    expect(isUuid("abc")).toBe(false);
    expect(isUuid("3f2b8c1e-5d4a-4e7b-9a10-0c2d3e4f5a6b'; drop table users")).toBe(false);
  });
});
