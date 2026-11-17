import { describe, expect, it } from "vitest";

import { authBaseUrl, neonAuthUrlFor } from "./base-url";

const host = "c-8.eu-central-1.aws.neon.tech";

describe("neonAuthUrlFor", () => {
  it("maps an unpooled connection string to its branch's Neon Auth", () => {
    expect(neonAuthUrlFor(`postgresql://u:p@ep-bold-haze-bat5fixe.${host}/neondb?sslmode=require`)).toBe(
      `https://ep-bold-haze-bat5fixe.neonauth.${host}/neondb/auth`,
    );
  });

  it("drops the pooler suffix", () => {
    expect(neonAuthUrlFor(`postgres://u:p@ep-hidden-darkness-bai7eilu-pooler.${host}/neondb`)).toBe(
      `https://ep-hidden-darkness-bai7eilu.neonauth.${host}/neondb/auth`,
    );
  });

  it("keeps another database name", () => {
    expect(neonAuthUrlFor(`postgres://u:p@ep-a-b.${host}/other`)).toBe(
      `https://ep-a-b.neonauth.${host}/other/auth`,
    );
  });

  it("returns null for missing, unreadable or non-Neon strings", () => {
    expect(neonAuthUrlFor(undefined)).toBeNull();
    expect(neonAuthUrlFor("not a url")).toBeNull();
    expect(neonAuthUrlFor("postgres://u:p@localhost/db")).toBeNull();
  });
});

describe("authBaseUrl", () => {
  const preview = `postgres://u:p@ep-hidden-darkness-bai7eilu-pooler.${host}/neondb`;

  it("uses NEON_AUTH_BASE_URL outside a preview", () => {
    expect(
      authBaseUrl({ NEON_AUTH_BASE_URL: "https://set", VERCEL_ENV: "production", DATABASE_URL: preview }),
    ).toBe("https://set");
    expect(authBaseUrl({ NEON_AUTH_BASE_URL: "https://set" })).toBe("https://set");
  });

  it("ignores NEON_AUTH_BASE_URL on a preview whose branch is known", () => {
    expect(
      authBaseUrl({ NEON_AUTH_BASE_URL: "https://set", VERCEL_ENV: "preview", DATABASE_URL: preview }),
    ).toBe(`https://ep-hidden-darkness-bai7eilu.neonauth.${host}/neondb/auth`);
  });

  it("falls back to NEON_AUTH_BASE_URL on a preview without a usable database URL", () => {
    expect(authBaseUrl({ NEON_AUTH_BASE_URL: "https://set", VERCEL_ENV: "preview" })).toBe("https://set");
  });

  it("derives the preview branch's Neon Auth on a Vercel preview", () => {
    expect(authBaseUrl({ VERCEL_ENV: "preview", DATABASE_URL: preview })).toBe(
      `https://ep-hidden-darkness-bai7eilu.neonauth.${host}/neondb/auth`,
    );
  });

  it("prefers the unpooled connection string", () => {
    expect(
      authBaseUrl({
        VERCEL_ENV: "preview",
        DATABASE_URL: preview,
        DATABASE_URL_UNPOOLED: `postgres://u:p@ep-other-x.${host}/neondb`,
      }),
    ).toBe(`https://ep-other-x.neonauth.${host}/neondb/auth`);
  });

  it("never derives outside a preview", () => {
    expect(authBaseUrl({ VERCEL_ENV: "production", DATABASE_URL: preview })).toBeNull();
    expect(authBaseUrl({ DATABASE_URL: preview })).toBeNull();
  });
});
