import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

function createDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local.");
  }
  return drizzle(neon(url), { schema });
}

let instance: ReturnType<typeof createDb> | undefined;

/** The database client, created on first use so that builds need no database. */
export function getDb() {
  instance ??= createDb();
  return instance;
}
