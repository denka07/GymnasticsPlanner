import { NextResponse, type NextRequest } from "next/server";

import { SIGN_IN_PATH } from "@/lib/auth/routes";

// Google sign-in returns here. The proxy has already exchanged the session
// verifier for the session cookie, so all that is left is to go to the start page.
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
}
