import { describe, expect, it } from "vitest";

import { isUpToDate, toUserValues } from "./user-values";

describe("toUserValues", () => {
  it("maps the auth user to our user values", () => {
    expect(
      toUserValues({ id: "auth-1", email: "anna@example.com", name: "Anna Svensson" }),
    ).toEqual({ authId: "auth-1", email: "anna@example.com", name: "Anna Svensson" });
  });

  it("trims values and lowercases the email", () => {
    expect(
      toUserValues({ id: " auth-1 ", email: " Anna@Example.COM ", name: "  Anna  " }),
    ).toEqual({ authId: "auth-1", email: "anna@example.com", name: "Anna" });
  });

  it("falls back to the start of the email when the name is missing or blank", () => {
    expect(toUserValues({ id: "auth-1", email: "anna@example.com" })?.name).toBe("anna");
    expect(toUserValues({ id: "auth-1", email: "anna@example.com", name: null })?.name).toBe(
      "anna",
    );
    expect(toUserValues({ id: "auth-1", email: "anna@example.com", name: "   " })?.name).toBe(
      "anna",
    );
  });

  it("returns null without a user, an id or an email", () => {
    expect(toUserValues(null)).toBeNull();
    expect(toUserValues(undefined)).toBeNull();
    expect(toUserValues({ id: "", email: "anna@example.com" })).toBeNull();
    expect(toUserValues({ id: "auth-1", email: null })).toBeNull();
    expect(toUserValues({ id: "auth-1", email: "  " })).toBeNull();
  });
});

describe("isUpToDate", () => {
  const values = { authId: "auth-1", email: "anna@example.com", name: "Anna" };

  it("is true when email and name match", () => {
    expect(isUpToDate({ email: "anna@example.com", name: "Anna" }, values)).toBe(true);
  });

  it("is false when the email or the name has changed", () => {
    expect(isUpToDate({ email: "old@example.com", name: "Anna" }, values)).toBe(false);
    expect(isUpToDate({ email: "anna@example.com", name: "Old" }, values)).toBe(false);
  });
});
