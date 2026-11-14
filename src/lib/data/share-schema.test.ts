import { describe, expect, it } from "vitest";

import { errorKey, newShareInput, shareResourceInput } from "./schemas";

describe("newShareInput", () => {
  it("trims and lower-cases the email", () => {
    expect(newShareInput.parse({ email: "  Helper@Example.TEST ", level: "view" })).toEqual({
      email: "helper@example.test",
      level: "view",
    });
  });

  it("rejects an invalid email", () => {
    for (const email of ["", "helper", "helper@", 42]) {
      const result = newShareInput.safeParse({ email, level: "edit" });
      expect(result.success).toBe(false);
      expect(errorKey(result.error!)).toBe("emailInvalid");
    }
  });

  it("accepts only view and edit", () => {
    expect(newShareInput.safeParse({ email: "a@b.se", level: "owner" }).success).toBe(false);
    expect(newShareInput.safeParse({ email: "a@b.se", level: "edit" }).success).toBe(true);
  });
});

describe("shareResourceInput", () => {
  it("takes a kind and a uuid", () => {
    const id = "3f2b8c1e-5d4a-4e7b-9a10-0c2d3e4f5a6b";
    expect(shareResourceInput.parse({ kind: "season", id })).toEqual({ kind: "season", id });
    expect(shareResourceInput.safeParse({ kind: "library", id }).success).toBe(false);
    expect(shareResourceInput.safeParse({ kind: "group", id: "x" }).success).toBe(false);
  });
});
