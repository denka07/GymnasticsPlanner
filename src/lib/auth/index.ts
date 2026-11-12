import "server-only";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getDb } from "@/db";
import { users, type User } from "@/db/schema";

import { devSignInEmail, devUserValues } from "./dev-sign-in";
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
  await cookies();
  const devEmail = devSignInEmail();
  const values = devEmail
    ? devUserValues(devEmail)
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

  return row;
});

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
