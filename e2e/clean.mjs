// `npm run test:e2e:clean`: removes all data the browser tests left behind,
// that is every group, station, exercise, hall and equipment named "E2E …", and
// the files under "e2e/" in the Blob store older than a day (newer ones may
// belong to a run in progress, for example on CI).
import { cleanE2eBlobs, cleanE2eData } from "./support/clean.mjs";

const DAY = 24 * 60 * 60 * 1000;

cleanE2eData()
  .then(async (counts) => {
    const files = await cleanE2eBlobs("e2e/", new Date(Date.now() - DAY));
    console.log("Removed E2E test data:", { ...counts, oldFiles: files });
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
