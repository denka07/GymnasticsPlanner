/** The fields of the auth provider's user that we copy into our users table. */
export type AuthUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

/** The values we store in our users table for a signed-in person. */
export type UserValues = {
  authId: string;
  email: string;
  name: string;
};

/**
 * Maps the auth provider's user to the values for our users table.
 * Returns null when the provider gives no id or email, since a row needs both.
 * The name falls back to the part of the email before the @.
 */
export function toUserValues(user: AuthUser | null | undefined): UserValues | null {
  const authId = user?.id?.trim();
  const email = user?.email?.trim().toLowerCase();
  if (!authId || !email) {
    return null;
  }

  const name = user?.name?.trim() || email.split("@")[0];

  return { authId, email, name };
}

/** True when the stored row already holds these values, so no write is needed. */
export function isUpToDate(
  stored: { email: string; name: string },
  values: UserValues,
): boolean {
  return stored.email === values.email && stored.name === values.name;
}
