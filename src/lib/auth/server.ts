import { createNeonAuth } from "@neon/auth/next/server";

function createAuth() {
  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (!baseUrl || !secret) {
    throw new Error(
      "NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set. Copy .env.example to .env.local.",
    );
  }
  return createNeonAuth({ baseUrl, cookies: { secret } });
}

let instance: ReturnType<typeof createAuth> | undefined;

/** The Neon Auth server instance, created on first use so that builds need no secrets. */
export function getAuth() {
  instance ??= createAuth();
  return instance;
}
