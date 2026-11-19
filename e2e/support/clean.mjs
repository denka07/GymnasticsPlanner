// Removes data left by the browser tests: groups, stations, exercises, halls
// and equipment whose names start with an E2E prefix. Used by the tests'
// set-up and teardown and by `npm run test:e2e:clean` (e2e/clean.mjs).
//
// It only ever deletes rows whose name starts with the given prefix, and it
// refuses any prefix that does not start with "E2E ". Attached files of the
// deleted sessions are deleted from the Blob store when no row refers to them
// any more, and the images of deleted equipment and halls stored under
// "e2e/" (both
// skipped without BLOB_READ_WRITE_TOKEN). Plain JavaScript so it
// runs with any supported Node.js version.

import { neon } from "@neondatabase/serverless";
import { del, list } from "@vercel/blob";
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
  const files = await sql`
    select distinct a.pathname from attachments a
      join sessions s on s.id = a.session_id
      join seasons se on se.id = s.season_id
      join groups g on g.id = se.group_id
    where g.name like ${pattern}`;
  // Groups first: deleting one removes its seasons, sessions, activities and
  // shares, so no activity still points at the library items below.
  // Halls before equipment: equipment fixed in a hall cannot be deleted.
  const [groups, stations, exercises, hallImages, halls, images, equipment] = await sql.transaction([
    sql`delete from groups where name like ${pattern} returning id`,
    sql`delete from stations where name like ${pattern} returning id`,
    sql`delete from exercises where name like ${pattern} returning id`,
    sql`select f.image_pathname as pathname from hall_features f
          join halls h on h.id = f.hall_id
        where h.name like ${pattern} and f.image_pathname is not null`,
    sql`delete from halls where name like ${pattern} returning id`,
    // The images of the configurations the next statement deletes with their equipment.
    sql`select c.image_pathname as pathname from equipment_configurations c
          join equipment e on e.id = c.equipment_id
        where e.name like ${pattern} and c.image_pathname is not null
          and not exists (select 1 from station_equipment se where se.equipment_id = e.id)
          and not exists (select 1 from hall_features hf where hf.equipment_id = e.id)`,
    sql`delete from equipment where name like ${pattern}
          and not exists (select 1 from station_equipment se where se.equipment_id = equipment.id)
          and not exists (select 1 from hall_features hf where hf.equipment_id = equipment.id)
        returning id`,
  ]);
  const removedFiles = await deleteUnreferencedBlobs(
    sql,
    files.map((f) => f.pathname),
  );
  const removedImages = await deleteE2eImages(
    [...images, ...hallImages].map((i) => i.pathname),
  );
  return {
    files: removedFiles,
    images: removedImages,
    groups: groups.length,
    stations: stations.length,
    exercises: exercises.length,
    halls: halls.length,
    equipment: equipment.length,
  };
}


function blobConfigured() {
  config({ path: ".env.local", quiet: true });
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/**
 * Deletes the stored images of removed test equipment and halls. Only paths under
 * "e2e/" are touched, where the browser tests store their files; an image a
 * dev server stored elsewhere is left behind. Returns how many went.
 *
 * @param {string[]} pathnames
 */
async function deleteE2eImages(pathnames) {
  const gone = pathnames.filter((p) => p.startsWith("e2e/"));
  if (gone.length === 0 || !blobConfigured()) {
    return 0;
  }
  await del(gone);
  return gone.length;
}

/**
 * Deletes the stored files among `pathnames` that no attachment refers to.
 * Returns how many went.
 *
 * @param {ReturnType<typeof neon>} sql
 * @param {string[]} pathnames
 */
async function deleteUnreferencedBlobs(sql, pathnames) {
  if (pathnames.length === 0 || !blobConfigured()) {
    return 0;
  }
  const kept = await sql`select distinct pathname from attachments where pathname = any(${pathnames})`;
  const keptSet = new Set(kept.map((k) => k.pathname));
  const gone = pathnames.filter((p) => !keptSet.has(p));
  if (gone.length > 0) {
    await del(gone);
  }
  return gone.length;
}

/**
 * Deletes every stored file under `folder` (which must lie under "e2e/") that
 * was uploaded before `before`. The browser tests store their files under
 * "e2e/<run id>/", so this never touches real files. Returns how many went;
 * 0 without BLOB_READ_WRITE_TOKEN.
 *
 * @param {string} folder
 * @param {Date} [before]
 * @returns {Promise<number>}
 */
export async function cleanE2eBlobs(folder, before = new Date()) {
  if (typeof folder !== "string" || !/^e2e\/([a-z0-9-]+\/)?$/.test(folder)) {
    throw new Error(`Refusing to clean stored files outside "e2e/": ${JSON.stringify(folder)}`);
  }
  if (!blobConfigured()) {
    return 0;
  }
  let removed = 0;
  let cursor;
  do {
    const page = await list({ prefix: folder, cursor, limit: 1000 });
    const old = page.blobs.filter((b) => new Date(b.uploadedAt) < before).map((b) => b.pathname);
    if (old.length > 0) {
      await del(old);
      removed += old.length;
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return removed;
}
