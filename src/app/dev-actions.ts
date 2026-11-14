"use server";

import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { DEV_USER_COOKIE, devSignInEmail, isDevUserKey } from "@/lib/auth/dev-sign-in";

/**
 * Switches the development sign-in to another test user. Refused (not found)
 * unless the development sign-in is on, which it never is in production.
 */
export async function switchDevUserAction(key: string): Promise<void> {
  if (!devSignInEmail() || !isDevUserKey(key)) {
    notFound();
  }
  (await cookies()).set(DEV_USER_COOKIE, key, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}
