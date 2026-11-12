import { afterEach, describe, expect, it, vi } from "vitest";

import { devSignInEmail, devUserValues } from "./dev-sign-in";

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

describe("devUserValues", () => {
  it("prefixes the auth id so it cannot clash with a real one", () => {
    expect(devUserValues("dev@example.test")).toEqual({
      authId: "dev:dev@example.test",
      email: "dev@example.test",
      name: "Dev Coach",
    });
  });
});
