import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../../src/db/schema";

/**
 * Direct database access for setting up test data and checking results that
 * the interface does not show. Same DATABASE_URL as the dev server (.env.local).
 */
let instance: ReturnType<typeof create> | undefined;

function create() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. The browser tests need .env.local.");
  }
  return drizzle(neon(url), { schema });
}

export function db() {
  instance ??= create();
  return instance;
}

export { schema };

/** The test users' addresses, as in src/lib/auth/dev-sign-in.ts. */
export function devEmail(user: "coach" | "helper" | "newcomer"): string {
  if (user === "coach") {
    config({ path: ".env.local", quiet: true });
    const email = process.env.DEV_SIGN_IN_EMAIL?.trim().toLowerCase();
    if (!email) {
      throw new Error("DEV_SIGN_IN_EMAIL is not set in .env.local; the browser tests need the development sign-in.");
    }
    return email;
  }
  return `${user}@example.test`;
}

/** The users row of a test user, who must have visited the app once. */
export async function devUserId(user: "coach" | "helper" | "newcomer"): Promise<string> {
  const email = devEmail(user);
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (!row) {
    throw new Error(`The test user ${user} has not signed in yet.`);
  }
  return row.id;
}
