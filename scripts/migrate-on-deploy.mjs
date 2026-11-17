// Applies pending database migrations before a build on Vercel.
//
// Production: the deployed code and the production schema always change
// together. Local development uses its own Neon branch, so a migration run
// locally never reaches production.
//
// Preview: each preview deployment gets its own Neon branch, a copy of
// production made by the Vercel integration, and migrations are applied to
// that copy so the preview's code and schema match. A preview must never
// change production, so the build stops if its database is the production
// endpoint.
import { spawnSync } from "node:child_process";

/** The compute endpoint of the production branch (Neon branch `main`). */
const PRODUCTION_ENDPOINT = "ep-bold-haze-bat5fixe";

const environment = process.env.VERCEL_ENV;

if (environment !== "production" && environment !== "preview") {
  console.log(
    `migrate-on-deploy: skipped (VERCEL_ENV is ${environment ?? "not set"}).`,
  );
  process.exit(0);
}

/** The Neon endpoint id of a connection string, for example "ep-bold-haze-bat5fixe". */
function endpointOf(url) {
  try {
    return new URL(url).hostname.split(".")[0].replace(/-pooler$/, "");
  } catch {
    return null;
  }
}

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const endpoint = url ? endpointOf(url) : null;
if (!endpoint) {
  console.error("migrate-on-deploy: no usable DATABASE_URL, stopping the build.");
  process.exit(1);
}

if (environment === "preview" && endpoint === PRODUCTION_ENDPOINT) {
  console.error(
    "migrate-on-deploy: this preview's database is production; refusing to migrate. Stopping the build.",
  );
  process.exit(1);
}

console.log(`migrate-on-deploy: applying pending migrations (${environment}, ${endpoint}).`);

const result = spawnSync("npx drizzle-kit migrate", {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.error("migrate-on-deploy: migration failed, stopping the build.");
  process.exit(result.status ?? 1);
}
