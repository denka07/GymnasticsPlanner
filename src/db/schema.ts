import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

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

export const focusLevel = pgEnum("focus_level", ["high", "medium", "low"]);
export const eventType = pgEnum("event_type", [
  "competition",
  "camp",
  "show",
  "other",
]);

/**
 * A team that is coached. Dates in the tables below are stored as DATE and
 * read as `YYYY-MM-DD` strings; weeks are identified by the date of their Monday.
 */
export const groups = pgTable(
  "groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("groups_owner_id_idx").on(t.ownerId)],
);

/** One term for one group. `firstWeek` and `lastWeek` are Mondays. */
export const seasons = pgTable(
  "seasons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    firstWeek: date("first_week", { mode: "string" }).notNull(),
    lastWeek: date("last_week", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("seasons_group_id_idx").on(t.groupId),
    check("seasons_week_order_check", sql`${t.lastWeek} >= ${t.firstWeek}`),
  ],
);

/** A recurring training time. `weekday` is ISO: Monday = 1 ... Sunday = 7. */
export const trainingSlots = pgTable(
  "training_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    location: text("location"),
  },
  (t) => [
    index("training_slots_season_id_idx").on(t.seasonId),
    check("training_slots_weekday_check", sql`${t.weekday} between 1 and 7`),
  ],
);

/** Sparse: a row exists only for a week with a break flag or a note. */
export const seasonWeeks = pgTable(
  "season_weeks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    /** Monday of the week. */
    weekStart: date("week_start", { mode: "string" }).notNull(),
    isBreak: boolean("is_break").notNull().default(false),
    note: text("note"),
  },
  (t) => [
    index("season_weeks_season_id_idx").on(t.seasonId),
    unique("season_weeks_season_id_week_start_unique").on(
      t.seasonId,
      t.weekStart,
    ),
  ],
);

export const disciplines = pgTable(
  "disciplines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [index("disciplines_season_id_idx").on(t.seasonId)],
);

export const focusItems = pgTable(
  "focus_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    disciplineId: uuid("discipline_id")
      .notNull()
      .references(() => disciplines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category"),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [index("focus_items_discipline_id_idx").on(t.disciplineId)],
);

/** One coloured cell of the season plan. No row means "not trained". */
export const focusAllocations = pgTable(
  "focus_allocations",
  {
    focusItemId: uuid("focus_item_id")
      .notNull()
      .references(() => focusItems.id, { onDelete: "cascade" }),
    /** Monday of the week. */
    weekStart: date("week_start", { mode: "string" }).notNull(),
    level: focusLevel("level").notNull(),
  },
  (t) => [primaryKey({ columns: [t.focusItemId, t.weekStart] })],
);

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: eventType("type").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
  },
  (t) => [
    index("events_season_id_idx").on(t.seasonId),
    check("events_date_order_check", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

export const groupsRelations = relations(groups, ({ one, many }) => ({
  owner: one(users, { fields: [groups.ownerId], references: [users.id] }),
  seasons: many(seasons),
}));

export const seasonsRelations = relations(seasons, ({ one, many }) => ({
  group: one(groups, { fields: [seasons.groupId], references: [groups.id] }),
  trainingSlots: many(trainingSlots),
  weeks: many(seasonWeeks),
  disciplines: many(disciplines),
  events: many(events),
}));

export const trainingSlotsRelations = relations(trainingSlots, ({ one }) => ({
  season: one(seasons, {
    fields: [trainingSlots.seasonId],
    references: [seasons.id],
  }),
}));

export const seasonWeeksRelations = relations(seasonWeeks, ({ one }) => ({
  season: one(seasons, {
    fields: [seasonWeeks.seasonId],
    references: [seasons.id],
  }),
}));

export const disciplinesRelations = relations(disciplines, ({ one, many }) => ({
  season: one(seasons, {
    fields: [disciplines.seasonId],
    references: [seasons.id],
  }),
  focusItems: many(focusItems),
}));

export const focusItemsRelations = relations(focusItems, ({ one, many }) => ({
  discipline: one(disciplines, {
    fields: [focusItems.disciplineId],
    references: [disciplines.id],
  }),
  allocations: many(focusAllocations),
}));

export const focusAllocationsRelations = relations(
  focusAllocations,
  ({ one }) => ({
    focusItem: one(focusItems, {
      fields: [focusAllocations.focusItemId],
      references: [focusItems.id],
    }),
  }),
);

export const eventsRelations = relations(events, ({ one }) => ({
  season: one(seasons, {
    fields: [events.seasonId],
    references: [seasons.id],
  }),
}));

export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Season = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type TrainingSlot = typeof trainingSlots.$inferSelect;
export type NewTrainingSlot = typeof trainingSlots.$inferInsert;
export type SeasonWeek = typeof seasonWeeks.$inferSelect;
export type NewSeasonWeek = typeof seasonWeeks.$inferInsert;
export type Discipline = typeof disciplines.$inferSelect;
export type NewDiscipline = typeof disciplines.$inferInsert;
export type FocusItem = typeof focusItems.$inferSelect;
export type NewFocusItem = typeof focusItems.$inferInsert;
export type FocusAllocation = typeof focusAllocations.$inferSelect;
export type NewFocusAllocation = typeof focusAllocations.$inferInsert;
export type FocusLevel = (typeof focusLevel.enumValues)[number];
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventType = (typeof eventType.enumValues)[number];
