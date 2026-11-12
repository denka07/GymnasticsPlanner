/**
 * Development-only sign-in, so pages can be tried locally without Google.
 *
 * Returns the trimmed DEV_SIGN_IN_EMAIL only while running under `next dev`
 * (NODE_ENV "development"). In production builds and in tests it is always
 * null, whatever the variable says.
 */
export function devSignInEmail(): string | null {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }
  const email = process.env.DEV_SIGN_IN_EMAIL?.trim().toLowerCase();
  return email ? email : null;
}

/** The users row values for the development sign-in. */
export function devUserValues(email: string) {
  return { authId: `dev:${email}`, email, name: "Dev Coach" };
}
