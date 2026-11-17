import { cleanE2eBlobs, cleanE2eData } from "./support/clean.mjs";

/**
 * After the run: nothing named with the E2E prefix may be left, and no file
 * this run stored under "e2e/<run id>/" in the Blob store (see
 * playwright.config.ts).
 */
export default async function globalTeardown() {
  const left = await cleanE2eData();
  if (Object.values(left).some((n) => n > 0)) {
    console.log("Removed E2E data the tests left behind:", left);
  }
  const folder = process.env.ATTACHMENTS_PATH_ENV;
  if (folder?.startsWith("e2e/")) {
    const files = await cleanE2eBlobs(`${folder}/`);
    if (files > 0) {
      console.log(`Removed ${files} stored file(s) the tests left under ${folder}/.`);
    }
  }
}
