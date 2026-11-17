import { createNeonAuth } from "@neon/auth/next/server";

import { authBaseUrl } from "./base-url";

function createAuth() {
  // NEON_AUTH_BASE_URL in production and locally; on a preview, the Neon Auth
  // of the preview's own database branch (see base-url.ts).
  const baseUrl = authBaseUrl(process.env);
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
