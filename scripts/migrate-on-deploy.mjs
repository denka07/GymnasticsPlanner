// Applies pending database migrations before a production build on Vercel.
//
// Local development uses its own Neon branch, so a migration run locally no
// longer reaches production. Running it here means the deployed code and the
// production schema always change together.
//
// Preview deployments are skipped on purpose: they must never change the
// production database.
import { spawnSync } from "node:child_process";

const environment = process.env.VERCEL_ENV;

if (environment !== "production") {
  console.log(
    `migrate-on-deploy: skipped (VERCEL_ENV is ${environment ?? "not set"}).`,
  );
  process.exit(0);
}

console.log("migrate-on-deploy: applying pending migrations to production.");

const result = spawnSync("npx drizzle-kit migrate", {
  stdio: "inherit",
  shell: true,
});

if (result.status !== 0) {
  console.error("migrate-on-deploy: migration failed, stopping the build.");
  process.exit(result.status ?? 1);
}
