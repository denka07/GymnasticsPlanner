"use client";

import { createAuthClient } from "@neon/auth/next";

/** Browser-side auth client. It talks to the proxy in src/app/api/auth. */
export const authClient = createAuthClient();
