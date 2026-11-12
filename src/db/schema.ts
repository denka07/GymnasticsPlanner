import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * A person who signs in: a coach or a help coach.
 * See docs/data-model.md.
 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Identifier of this person at the sign-in provider. */
  authId: text("auth_id").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** Administrators maintain the global library and review submissions. */
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
