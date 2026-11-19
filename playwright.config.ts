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

// E2E_PORT runs the tests against a dev server on another port (default 3000).
const PORT = Number(process.env.E2E_PORT || 3000);
const baseURL = `http://localhost:${PORT}`;

// Files the tests attach go to this folder of the Blob store, so a run's
// clean-up never touches another run's or real files. A dev server that the
// tests reuse instead of starting needs the same ATTACHMENTS_PATH_ENV (and
// E2E_RUN_ID) to store its files there; see "Browser tests" in README.md.
process.env.ATTACHMENTS_PATH_ENV ??= `e2e/${process.env.E2E_RUN_ID}`;

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
      testIgnore: ["**/session-page.spec.ts", "**/session-timer.spec.ts", "**/plan-reading.spec.ts"],
    },
    {
      // The session page is made for a phone in the gym.
      name: "phone",
      use: { ...devices["Pixel 7"] },
      testMatch: ["**/session-page.spec.ts", "**/session-timer.spec.ts", "**/plan-reading.spec.ts"],
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: baseURL,
    env: { ATTACHMENTS_PATH_ENV: process.env.ATTACHMENTS_PATH_ENV },
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
