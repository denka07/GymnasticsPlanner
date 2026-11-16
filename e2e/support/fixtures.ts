import {
  test as base,
  expect,
  type Browser,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import { cleanE2eData } from "./clean.mjs";

export type DevUser = "coach" | "helper" | "newcomer";

/** The id shared by every test of this run, set in playwright.config.ts. */
export const RUN_ID = process.env.E2E_RUN_ID ?? "0000";

/**
 * Opens a page in a fresh browser context signed in as `user` through the
 * development sign-in: its `dev_user` cookie picks the test user.
 */
async function pageAs(browser: Browser, testInfo: TestInfo, user: DevUser): Promise<Page> {
  const use = testInfo.project.use;
  const baseURL = use.baseURL ?? "http://localhost:3000";
  const context = await browser.newContext({
    baseURL,
    locale: use.locale,
    timezoneId: use.timezoneId,
    viewport: use.viewport,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
  });
  await context.addCookies([{ name: "dev_user", value: user, url: baseURL }]);
  return context.newPage();
}

type Fixtures = {
  /**
   * This test's unique name prefix, e.g. "E2E 3f9a 1c2d3e". Everything the
   * test creates is named "<prefix> …"; it is all removed when the test ends,
   * whether it passed or not.
   */
  prefix: string;
  /** Signed in as Dev Coach (the default page). */
  coach: Page;
  /** Signed in as Dev Helper, in a separate browser context. */
  helper: Page;
  /** Signed in as Dev Newcomer, in a separate browser context. */
  newcomer: Page;
};

// The second argument of a fixture is named `provide`, not `use`, so the
// React hooks lint rule does not mistake it for React's `use`.
export const test = base.extend<Fixtures>({
  prefix: async ({}, provide, testInfo) => {
    const prefix = `E2E ${RUN_ID} ${testInfo.testId.slice(-6)}`;
    try {
      await provide(prefix);
    } finally {
      await cleanE2eData(`${prefix} `);
    }
  },
  coach: async ({ page, context, baseURL }, provide) => {
    await context.addCookies([{ name: "dev_user", value: "coach", url: baseURL ?? "http://localhost:3000" }]);
    await provide(page);
  },
  helper: async ({ browser }, provide, testInfo) => {
    const page = await pageAs(browser, testInfo, "helper");
    await provide(page);
    await page.context().close();
  },
  newcomer: async ({ browser }, provide, testInfo) => {
    const page = await pageAs(browser, testInfo, "newcomer");
    await provide(page);
    await page.context().close();
  },
});

export { expect };

/**
 * Waits until React has hydrated the element, so typing into it or clicking
 * it reaches its handlers. Hydrated elements carry React's `__reactProps$…` key.
 */
export async function hydrated(locator: Locator): Promise<Locator> {
  await expect
    .poll(() => locator.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), {
      timeout: 30_000,
    })
    .toBe(true);
  return locator;
}

/**
 * Clicks `trigger` until `opened` is visible. Under `next dev` a page can be
 * shown before React has hydrated it, and a click on a dialog or menu button
 * in that moment does nothing.
 */
export async function openWith(trigger: Locator, opened: Locator): Promise<void> {
  await expect(async () => {
    if (!(await opened.isVisible())) {
      await trigger.click();
    }
    await expect(opened).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}
