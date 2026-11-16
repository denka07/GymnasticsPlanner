import type { FullConfig } from "@playwright/test";

import { cleanE2eData } from "./support/clean.mjs";

/**
 * Before the run: remove data an earlier, interrupted run left behind, check
 * that the dev server signs in the test users, and make sure Dev Coach and
 * Dev Helper exist (the set-up helpers look them up).
 */
export default async function globalSetup(config: FullConfig) {
  const left = await cleanE2eData();
  if (Object.values(left).some((n) => n > 0)) {
    console.log("Removed E2E data left by an earlier run:", left);
  }
  const baseURL = config.projects[0].use.baseURL ?? "http://localhost:3000";
  for (const user of ["coach", "helper"]) {
    const response = await fetch(baseURL, { headers: { cookie: `dev_user=${user}` } });
    const html = await response.text();
    if (!html.includes("Testanvändare")) {
      throw new Error(
        "The dev server did not sign in a test user. The browser tests need `next dev` " +
          "with DEV_SIGN_IN_EMAIL set in .env.local.",
      );
    }
  }
}
