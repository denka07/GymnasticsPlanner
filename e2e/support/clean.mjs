// Removes data left by the browser tests: groups, stations, exercises and
// equipment whose names start with an E2E prefix. Used by the tests'
// set-up and teardown and by `npm run test:e2e:clean` (e2e/clean.mjs).
//
// It only ever deletes rows whose name starts with the given prefix, and it
// refuses any prefix that does not start with "E2E ". Plain JavaScript so it
// runs with any supported Node.js version.

import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

/** Every name the browser tests create starts with this. */
export const E2E_PREFIX = "E2E ";

/** Escapes LIKE wildcards, so a prefix only ever matches itself. */
function likePrefix(prefix) {
  return prefix.replace(/[\\%_]/g, (c) => `\\${c}`) + "%";
}

function databaseUrl() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. The browser tests need .env.local.");
  }
  return url;
}

/**
 * Deletes everything named with `prefix` ("E2E " for all test data, or a
 * test's own "E2E 3f9a 7 "). Returns how many rows of each kind went.
 *
 * @param {string} prefix
 * @returns {Promise<Record<string, number>>}
 */
export async function cleanE2eData(prefix = E2E_PREFIX) {
  if (typeof prefix !== "string" || !prefix.startsWith(E2E_PREFIX)) {
    throw new Error(`Refusing to clean data without the "${E2E_PREFIX}" prefix: ${JSON.stringify(prefix)}`);
  }
  const sql = neon(databaseUrl());
  const pattern = likePrefix(prefix);
  // Groups first: deleting one removes its seasons, sessions, activities and
  // shares, so no activity still points at the library items below.
  const [groups, stations, exercises, equipment] = await sql.transaction([
    sql`delete from groups where name like ${pattern} returning id`,
    sql`delete from stations where name like ${pattern} returning id`,
    sql`delete from exercises where name like ${pattern} returning id`,
    sql`delete from equipment where name like ${pattern}
          and not exists (select 1 from station_equipment se where se.equipment_id = equipment.id)
        returning id`,
  ]);
  return {
    groups: groups.length,
    stations: stations.length,
    exercises: exercises.length,
    equipment: equipment.length,
  };
}

