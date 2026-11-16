import { cleanE2eData } from "./support/clean.mjs";

/** After the run: nothing named with the E2E prefix may be left. */
export default async function globalTeardown() {
  const left = await cleanE2eData();
  if (Object.values(left).some((n) => n > 0)) {
    console.log("Removed E2E data the tests left behind:", left);
  }
}
