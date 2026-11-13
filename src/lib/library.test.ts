import { describe, expect, it } from "vitest";

import {
  byName,
  formatEquipmentLines,
  hasName,
  libraryAccess,
  matchesSearch,
  pgErrorCode,
  searchPattern,
} from "./library";

const owner = { id: "u1", isAdmin: false };
const other = { id: "u2", isAdmin: false };
const admin = { id: "a1", isAdmin: true };

describe("libraryAccess", () => {
  it("lets the owner of a personal item edit it", () => {
    expect(libraryAccess({ scope: "personal", ownerId: "u1" }, owner)).toBe("edit");
  });

  it("hides a personal item from everyone else, administrators included", () => {
    expect(libraryAccess({ scope: "personal", ownerId: "u1" }, other)).toBeNull();
    expect(libraryAccess({ scope: "personal", ownerId: "u1" }, admin)).toBeNull();
  });

  it("lets everyone view a global item and only administrators edit it", () => {
    expect(libraryAccess({ scope: "global", ownerId: null }, owner)).toBe("view");
    expect(libraryAccess({ scope: "global", ownerId: null }, admin)).toBe("edit");
  });

  it("gives no access to a personal item without an owner", () => {
    expect(libraryAccess({ scope: "personal", ownerId: null }, owner)).toBeNull();
  });
});

describe("searchPattern", () => {
  it("returns null for an empty search", () => {
    expect(searchPattern("")).toBeNull();
    expect(searchPattern("   ")).toBeNull();
    expect(searchPattern(undefined)).toBeNull();
  });

  it("matches anywhere and trims", () => {
    expect(searchPattern("  volt ")).toBe("%volt%");
  });

  it("escapes LIKE wildcards", () => {
    expect(searchPattern("50%_a\\b")).toBe("%50\\%\\_a\\\\b%");
  });
});

describe("matchesSearch", () => {
  it("ignores case, including å, ä and ö", () => {
    expect(matchesSearch("Sträckt volt", "STRÄCK")).toBe(true);
    expect(matchesSearch("Plint", "matta")).toBe(false);
    expect(matchesSearch("Plint", " ")).toBe(true);
  });
});

describe("hasName", () => {
  it("compares names ignoring case and space", () => {
    expect(hasName(["Kil", "Plint"], " kil ")).toBe(true);
    expect(hasName(["Kil"], "Kilen")).toBe(false);
  });
});

describe("byName", () => {
  it("sorts å, ä and ö after z", () => {
    const sorted = [{ name: "Ö" }, { name: "a" }, { name: "Z" }, { name: "Å" }].sort(byName);
    expect(sorted.map((n) => n.name)).toEqual(["a", "Z", "Å", "Ö"]);
  });
});

describe("formatEquipmentLines", () => {
  it("shows quantities above one and keeps the order", () => {
    expect(
      formatEquipmentLines([
        { name: "Tunnmatta", quantity: 2 },
        { name: "Plint", quantity: 1 },
      ]),
    ).toBe("2 × Tunnmatta, Plint");
  });

  it("is empty for no lines", () => {
    expect(formatEquipmentLines([])).toBe("");
  });
});

describe("pgErrorCode", () => {
  it("finds the code on a wrapped database error", () => {
    const cause = Object.assign(new Error("duplicate key"), { code: "23505" });
    const wrapped = new Error("Failed query", { cause });
    expect(pgErrorCode(wrapped)).toBe("23505");
  });

  it("returns null when there is no Postgres code", () => {
    expect(pgErrorCode(new Error("boom"))).toBeNull();
    expect(pgErrorCode(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBeNull();
    expect(pgErrorCode(null)).toBeNull();
  });
});
