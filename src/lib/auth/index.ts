import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "@/db";
import { shares, users, type User } from "@/db/schema";

import { DEV_USER_COOKIE, devSignInEmail, devSignInValues } from "./dev-sign-in";
import { SIGN_IN_PATH } from "./routes";
import { getAuth } from "./server";
import { isUpToDate, toUserValues } from "./user-values";

/**
 * Our users row for the person signed in on this request, or null.
 *
 * The row is created on the first authenticated request and its email and name
 * are kept in step with the auth provider. Reads the session cookie, so callers
 * must render inside a Suspense boundary. Cached for the duration of a request.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  // Mark this as request-time work before the SDK runs. During prerendering
  // this await never resolves, so the SDK does not log a cookie error.
  const cookieStore = await cookies();
  const values = devSignInEmail()
    ? devSignInValues(cookieStore.get(DEV_USER_COOKIE)?.value)
    : toUserValues((await getAuth().getSession()).data?.user);
  if (!values) {
    return null;
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.authId, values.authId))
    .limit(1);

  if (existing && isUpToDate(existing, values)) {
    return existing;
  }

  // Upsert on auth_id, so two simultaneous first requests end with one row.
  const [row] = await db
    .insert(users)
    .values(values)
    .onConflictDoUpdate({
      target: users.authId,
      set: { email: values.email, name: values.name },
    })
    .returning();

  // Shares made out to this address before the person signed in (or before
  // their address changed to it) start working now.
  await attachWaitingShares(row);
  return row;
});

/** Gives the user the waiting shares made out to their email address. */
export async function attachWaitingShares(user: Pick<User, "id" | "email">): Promise<void> {
  await getDb()
    .update(shares)
    .set({ userId: user.id })
    .where(and(eq(shares.email, user.email.toLowerCase()), isNull(shares.userId)));
}

/** Like getCurrentUser, but sends people who are not signed in to the sign-in page. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(SIGN_IN_PATH);
  }
  return user;
}

/** Signs the current person out. For use in Server Actions. */
export async function signOut(): Promise<void> {
  if (devSignInEmail()) {
    // The development sign-in has no session to end; the action just redirects.
    return;
  }
  await getAuth().signOut();
}
