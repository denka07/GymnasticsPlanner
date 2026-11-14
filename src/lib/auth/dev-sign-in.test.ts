import { afterEach, describe, expect, it, vi } from "vitest";

import { devSignInEmail, devSignInValues, isDevUserKey } from "./dev-sign-in";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("devSignInEmail", () => {
  it("returns the trimmed email under next dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SIGN_IN_EMAIL", "  dev@example.test ");
    expect(devSignInEmail()).toBe("dev@example.test");
  });

  it("is null in production even with the variable set", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEV_SIGN_IN_EMAIL", "dev@example.test");
    expect(devSignInEmail()).toBeNull();
  });

  it("is null in tests even with the variable set", () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DEV_SIGN_IN_EMAIL", "dev@example.test");
    expect(devSignInEmail()).toBeNull();
  });

  it("is null in development when the variable is empty", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SIGN_IN_EMAIL", "   ");
    expect(devSignInEmail()).toBeNull();
  });
});

describe("devSignInValues", () => {
  it("signs in as Dev Coach by default, with a prefixed auth id", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SIGN_IN_EMAIL", "dev@example.test");
    const coach = { authId: "dev:dev@example.test", email: "dev@example.test", name: "Dev Coach" };
    expect(devSignInValues(undefined)).toEqual(coach);
    expect(devSignInValues("coach")).toEqual(coach);
    expect(devSignInValues("nobody")).toEqual(coach);
  });

  it("switches to the helper with the cookie", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SIGN_IN_EMAIL", "dev@example.test");
    expect(devSignInValues("helper")).toEqual({
      authId: "dev:helper@example.test",
      email: "helper@example.test",
      name: "Dev Helper",
    });
  });

  it("never signs anyone in outside development, whatever the cookie says", () => {
    for (const env of ["production", "test"]) {
      vi.stubEnv("NODE_ENV", env);
      vi.stubEnv("DEV_SIGN_IN_EMAIL", "dev@example.test");
      expect(devSignInValues(undefined)).toBeNull();
      expect(devSignInValues("helper")).toBeNull();
      expect(devSignInValues("newcomer")).toBeNull();
    }
  });

  it("is off in development without DEV_SIGN_IN_EMAIL", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("DEV_SIGN_IN_EMAIL", "");
    expect(devSignInValues("helper")).toBeNull();
  });
});

describe("isDevUserKey", () => {
  it("accepts only known keys", () => {
    expect(isDevUserKey("helper")).toBe(true);
    expect(isDevUserKey("coach")).toBe(true);
    expect(isDevUserKey("admin")).toBe(false);
    expect(isDevUserKey(undefined)).toBe(false);
  });
});
