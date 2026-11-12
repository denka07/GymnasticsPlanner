"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/auth/routes";

export async function signOutAction() {
  await signOut();
  redirect(SIGN_IN_PATH);
}
