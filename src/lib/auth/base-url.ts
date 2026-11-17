/**
 * The Neon Auth address of the database branch a connection string points
 * at. Each Neon branch with Neon Auth serves it from its compute endpoint:
 * a database at `ep-x[-pooler].<region host>/<db>` has Neon Auth at
 * `https://ep-x.neonauth.<region host>/<db>/auth`. Null when the connection
 * string cannot be read.
 */
export function neonAuthUrlFor(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) {
    return null;
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return null;
  }
  const [first, ...rest] = url.hostname.split(".");
  const endpoint = first.replace(/-pooler$/, "");
  if (!endpoint.startsWith("ep-") || rest.length === 0) {
    return null;
  }
  const database = url.pathname.replace(/^\//, "") || "neondb";
  return `https://${endpoint}.neonauth.${rest.join(".")}/${database}/auth`;
}

/**
 * Where the app's Neon Auth lives.
 *
 * - On a Vercel preview: the Neon Auth of the preview's own database branch,
 *   derived from DATABASE_URL, whatever NEON_AUTH_BASE_URL says. That branch's
 *   Neon Auth already trusts the preview's addresses; production's Neon Auth
 *   (which NEON_AUTH_BASE_URL and the integration's DATABASE_NEON_AUTH_BASE_URL
 *   point at) does not, so sign-in could not start.
 * - Otherwise NEON_AUTH_BASE_URL (production and local development).
 */
export function authBaseUrl(env: Record<string, string | undefined>): string | null {
  if (env.VERCEL_ENV === "preview") {
    const derived = neonAuthUrlFor(env.DATABASE_URL_UNPOOLED || env.DATABASE_URL);
    if (derived) {
      return derived;
    }
  }
  return env.NEON_AUTH_BASE_URL || null;
}
