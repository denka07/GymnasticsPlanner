// `npm run test:e2e:clean`: removes all data the browser tests left behind,
// that is every group, station, exercise and equipment named "E2E …".
import { cleanE2eData } from "./support/clean.mjs";

cleanE2eData()
  .then((counts) => console.log("Removed E2E test data:", counts))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
