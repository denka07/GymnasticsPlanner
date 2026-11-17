import { randomBytes } from "node:crypto";

import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests for the main flows. They run against `next dev` with the
 * development sign-in (see src/lib/auth/dev-sign-in.ts) and the database in
 * DATABASE_URL from .env.local (the Neon branch `dev`). Everything a test
 * creates is named with the prefix "E2E <run id> <test number>" and removed
 * afterwards; see "Browser tests" in README.md.
 */

// One id per run, shared with the worker processes through the environment.
process.env.E2E_RUN_ID ??= randomBytes(2).toString("hex");

const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // One worker: the tests share test users and the dev database, and
  // `next dev` compiles pages on first request.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    locale: "sv-SE",
    timezoneId: "Europe/Stockholm",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: ["**/session-page.spec.ts", "**/session-timer.spec.ts"],
    },
    {
      // The session page is made for a phone in the gym.
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testMatch: ["**/session-page.spec.ts", "**/session-timer.spec.ts"],
    },
  ],
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
