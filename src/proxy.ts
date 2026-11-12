import { NextResponse, type NextRequest } from "next/server";

import { devSignInEmail } from "@/lib/auth/dev-sign-in";
import { AUTH_ERROR_PATH, SIGN_IN_PATH } from "@/lib/auth/routes";
import { getAuth } from "@/lib/auth/server";

let middleware: ReturnType<ReturnType<typeof getAuth>["middleware"]> | undefined;

/**
 * Completes Google sign-in (exchanges the session verifier on the callback),
 * refreshes the session, and sends signed-out visitors to the start page.
 * Pages still check access on the server; this is not the only guard.
 */
export function proxy(request: NextRequest) {
  if (devSignInEmail()) {
    // Development-only sign-in: there is no auth session to refresh.
    return NextResponse.next();
  }
  middleware ??= getAuth().middleware({
    loginUrl: SIGN_IN_PATH,
    publicRoutes: [AUTH_ERROR_PATH],
  });
  return middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
