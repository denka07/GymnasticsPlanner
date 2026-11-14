/**
 * Development-only sign-in, so pages can be tried locally without Google.
 *
 * Everything here is gated by devSignInEmail(): it returns the trimmed
 * DEV_SIGN_IN_EMAIL only while running under `next dev` (NODE_ENV
 * "development"). In production builds and in tests it is always null,
 * whatever the variable says, and then no other function here signs anyone in.
 */
export function devSignInEmail(): string | null {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }
  const email = process.env.DEV_SIGN_IN_EMAIL?.trim().toLowerCase();
  return email ? email : null;
}

/** Cookie that picks which test user the development sign-in uses. */
export const DEV_USER_COOKIE = "dev_user";

/**
 * The test users one can switch between in development. "coach" signs in as
 * DEV_SIGN_IN_EMAIL; the others have fixed addresses, so sharing can be tried
 * with two accounts (and with an address that has not signed in yet).
 */
export const DEV_USERS = [
  { key: "coach", name: "Dev Coach", email: null },
  { key: "helper", name: "Dev Helper", email: "helper@example.test" },
  { key: "newcomer", name: "Dev Newcomer", email: "newcomer@example.test" },
] as const;

export type DevUserKey = (typeof DEV_USERS)[number]["key"];

/** True for a known test user key. */
export function isDevUserKey(value: unknown): value is DevUserKey {
  return DEV_USERS.some((u) => u.key === value);
}

/**
 * The users row values for the development sign-in, for the test user named
 * by the cookie (Dev Coach when it is missing or unknown). Null whenever the
 * development sign-in is off, which it always is in production.
 */
export function devSignInValues(
  cookieValue: string | undefined,
): { authId: string; email: string; name: string } | null {
  const coachEmail = devSignInEmail();
  if (!coachEmail) {
    return null;
  }
  const user = DEV_USERS.find((u) => u.key === cookieValue) ?? DEV_USERS[0];
  const email = user.email ?? coachEmail;
  return { authId: `dev:${email}`, email, name: user.name };
}
