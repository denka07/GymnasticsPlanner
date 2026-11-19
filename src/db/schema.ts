import { relations, sql } from "drizzle-orm";
import {
  boolean,
  type AnyPgColumn,
  check,
  date,
  foreignKey,
  doublePrecision,
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
  uniqueIndex,
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
    /** The default hall of this training day; copied to a session when it is first stored. */
    hallId: uuid("hall_id").references((): AnyPgColumn => halls.id, { onDelete: "set null" }),
  },
  (t) => [
    index("training_slots_season_id_idx").on(t.seasonId),
    index("training_slots_hall_id_idx").on(t.hallId),
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
    description: text("description"),
  },
  (t) => [
    index("events_season_id_idx").on(t.seasonId),
    check("events_date_order_check", sql`${t.endDate} >= ${t.startDate}`),
  ],
);

/**
 * One training occasion. A session tied to a training slot was created from
 * that slot the first time it was edited; it keeps its own date, times and
 * location even if the slot later changes. Extra sessions have no slot.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    seasonId: uuid("season_id")
      .notNull()
      .references(() => seasons.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    location: text("location"),
    trainingSlotId: uuid("training_slot_id").references(() => trainingSlots.id, {
      onDelete: "set null",
    }),
    /** Copied from the slot when the session is first stored; then the session's own. */
    hallId: uuid("hall_id").references((): AnyPgColumn => halls.id, { onDelete: "set null" }),
    isCancelled: boolean("is_cancelled").notNull().default(false),
    /** Free text after the session about how it went. */
    noteAfter: text("note_after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("sessions_season_id_date_idx").on(t.seasonId, t.date),
    index("sessions_hall_id_idx").on(t.hallId),
    unique("sessions_training_slot_id_date_unique").on(t.trainingSlotId, t.date),
  ],
);

/** An ordered entry in a session's agenda. */
export const sessionParts = pgTable(
  "session_parts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sortOrder: integer("sort_order").notNull(),
    durationMinutes: integer("duration_minutes"),
    disciplineId: uuid("discipline_id").references(() => disciplines.id, {
      onDelete: "set null",
    }),
    isDone: boolean("is_done").notNull().default(false),
  },
  (t) => [
    index("session_parts_session_id_idx").on(t.sessionId),
    check(
      "session_parts_duration_check",
      sql`${t.durationMinutes} is null or ${t.durationMinutes} between 1 and 600`,
    ),
  ],
);

/**
 * An ordered line under a session part: an optional station, exercises in
 * order (activity_exercises) and optional text, where empty text means none.
 * An activity has at least one of exercises or text. Saving checks that, and
 * deleting a linked exercise writes its name into the text of an activity
 * that would otherwise be left with neither.
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionPartId: uuid("session_part_id")
      .notNull()
      .references(() => sessionParts.id, { onDelete: "cascade" }),
    stationId: uuid("station_id").references((): AnyPgColumn => stations.id, {
      onDelete: "set null",
    }),
    text: text("text").notNull().default(""),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [
    index("activities_session_part_id_idx").on(t.sessionPartId),
    index("activities_station_id_idx").on(t.stationId),
  ],
);

/** An exercise of an activity, in order. */
export const activityExercises = pgTable(
  "activity_exercises",
  {
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references((): AnyPgColumn => exercises.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.exerciseId] }),
    index("activity_exercises_exercise_id_idx").on(t.exerciseId),
  ],
);

/**
 * A file (photo or PDF) attached to a whole session. The file itself lives in
 * the private Vercel Blob store under `pathname`; copying a session's content
 * copies its rows, so several rows can share one stored file. The file is
 * deleted from the store when the last row that refers to it goes.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    /** Path of the file in the Blob store, e.g. production/sessions/<id>/<random>-plan.pdf. */
    pathname: text("pathname").notNull(),
    /** The name the file had when it was uploaded, as shown in the list. */
    fileName: text("file_name").notNull(),
    /** Checked against the file's first bytes when it was stored. */
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("attachments_session_id_pathname_unique").on(t.sessionId, t.pathname),
    index("attachments_pathname_idx").on(t.pathname),
    check("attachments_size_check", sql`${t.sizeBytes} > 0`),
  ],
);

// --- Library -------------------------------------------------------------------

/** Global items are visible to everyone and edited by administrators; personal ones by their owner. */
export const libraryScope = pgEnum("library_scope", ["global", "personal"]);

/** One catalogue of equipment types, read by everyone and edited by administrators. */
export const equipment = pgTable(
  "equipment",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("equipment_name_lower_unique").on(sql`lower(${t.name})`)],
);

/**
 * One way a piece of equipment can be set up, seen from above, with the size
 * it covers on the floor and how it is drawn: its image (stretched to the
 * size), else a rectangle in its colour. At most one per equipment is the
 * default, used when the equipment is placed in a drawing.
 */
export const equipmentConfigurations = pgTable(
  "equipment_configurations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Across, in whole centimetres (x in a drawing). */
    widthCm: integer("width_cm").notNull(),
    /** Along, in whole centimetres (y in a drawing). */
    lengthCm: integer("length_cm").notNull(),
    /** Path of the image in the Blob store, e.g. production/equipment/<id>/<random>-tunnmatta.png. */
    imagePathname: text("image_pathname"),
    /** Checked against the image's first bytes when it was stored. */
    imageContentType: text("image_content_type"),
    /** "#rrggbb", lowercase. */
    color: text("color"),
    sortOrder: integer("sort_order").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("equipment_configurations_name_lower_unique").on(
      t.equipmentId,
      sql`lower(${t.name})`,
    ),
    uniqueIndex("equipment_configurations_one_default")
      .on(t.equipmentId)
      .where(sql`${t.isDefault}`),
    check(
      "equipment_configurations_size_check",
      sql`${t.widthCm} between 1 and 5000 and ${t.lengthCm} between 1 and 5000`,
    ),
    check(
      "equipment_configurations_color_check",
      sql`${t.color} is null or ${t.color} ~ '^#[0-9a-f]{6}$'`,
    ),
    check(
      "equipment_configurations_image_check",
      sql`(${t.imagePathname} is null and ${t.imageContentType} is null) or (${t.imagePathname} is not null and ${t.imageContentType} in ('image/png', 'image/jpeg', 'image/webp'))`,
    ),
  ],
);

// --- Halls ----------------------------------------------------------------------

/**
 * A training hall, global like the equipment catalogue: everyone reads it,
 * administrators edit it. Sizes are whole centimetres; drawings work in
 * metres. See docs/data-model.md, "Hall".
 */
export const halls = pgTable(
  "halls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    /** Across, in whole centimetres (x in a drawing). */
    widthCm: integer("width_cm").notNull(),
    /** Along, in whole centimetres (y in a drawing). */
    lengthCm: integer("length_cm").notNull(),
    /** "#rrggbb", lowercase; the floor is drawn in it unless it has an image. */
    floorColor: text("floor_color").notNull().default("#ece3d0"),
    /** Path in the Blob store, in the hall's folder; stretched to the hall's size. */
    floorImagePathname: text("floor_image_pathname"),
    floorImageContentType: text("floor_image_content_type"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("halls_name_lower_unique").on(sql`lower(${t.name})`),
    check(
      "halls_size_check",
      sql`${t.widthCm} between 1 and 20000 and ${t.lengthCm} between 1 and 20000`,
    ),
    check("halls_floor_color_check", sql`${t.floorColor} ~ '^#[0-9a-f]{6}$'`),
    check(
      "halls_floor_image_check",
      sql`(${t.floorImagePathname} is null and ${t.floorImageContentType} is null) or (${t.floorImagePathname} is not null and ${t.floorImageContentType} in ('image/png', 'image/jpeg', 'image/webp'))`,
    ),
  ],
);

export const hallFeatureKind = pgEnum("hall_feature_kind", [
  "wall_bars",
  "door",
  "port",
  "storage",
  "wall",
  "foam_pit",
  "md_pit",
  "stands",
  "other",
  "equipment",
]);

/**
 * Something fixed in a hall. An equipment feature is a catalogue
 * configuration and takes its size and look from it; every other kind has
 * its own size, colour and optional image (stretched to its size). The
 * position is the centre in centimetres from the hall's top-left corner,
 * the rotation in degrees clockwise, and `layer` the drawing order. Ids
 * are chosen by the editor, so a feature keeps its id across saves.
 */
export const hallFeatures = pgTable(
  "hall_features",
  {
    id: uuid("id").primaryKey(),
    hallId: uuid("hall_id")
      .notNull()
      .references(() => halls.id, { onDelete: "cascade" }),
    kind: hallFeatureKind("kind").notNull(),
    /** Equipment features only; equipment fixed in a hall cannot be deleted. */
    equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "restrict" }),
    configurationId: uuid("configuration_id").references(() => equipmentConfigurations.id, {
      onDelete: "restrict",
    }),
    /** Other kinds only. */
    widthCm: integer("width_cm"),
    lengthCm: integer("length_cm"),
    /** "#rrggbb", lowercase; other kinds only. */
    color: text("color"),
    /** Path in the Blob store, e.g. production/halls/<hallId>/<random>-mdgrop.png. */
    imagePathname: text("image_pathname"),
    imageContentType: text("image_content_type"),
    xCm: integer("x_cm").notNull(),
    yCm: integer("y_cm").notNull(),
    rotation: doublePrecision("rotation").notNull().default(0),
    layer: integer("layer").notNull(),
    label: text("label"),
  },
  (t) => [
    index("hall_features_hall_id_idx").on(t.hallId),
    index("hall_features_equipment_id_idx").on(t.equipmentId),
    index("hall_features_configuration_id_idx").on(t.configurationId),
    check(
      "hall_features_kind_check",
      sql`(${t.kind} = 'equipment' and ${t.equipmentId} is not null and ${t.configurationId} is not null and ${t.widthCm} is null and ${t.lengthCm} is null and ${t.color} is null and ${t.imagePathname} is null) or (${t.kind} <> 'equipment' and ${t.equipmentId} is null and ${t.configurationId} is null and ${t.widthCm} between 1 and 20000 and ${t.lengthCm} between 1 and 20000)`,
    ),
    check("hall_features_color_check", sql`${t.color} is null or ${t.color} ~ '^#[0-9a-f]{6}$'`),
    check(
      "hall_features_image_check",
      sql`(${t.imagePathname} is null and ${t.imageContentType} is null) or (${t.imagePathname} is not null and ${t.imageContentType} in ('image/png', 'image/jpeg', 'image/webp'))`,
    ),
    check("hall_features_rotation_check", sql`${t.rotation} >= 0 and ${t.rotation} < 360`),
  ],
);

/** A reusable exercise. A personal one has an owner; a global one has none. */
export const exercises = pgTable(
  "exercises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    /** Free text, since disciplines are defined per season. */
    disciplineName: text("discipline_name"),
    scope: libraryScope("scope").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "restrict" }),
    /**
     * Who created the item. Kept when it becomes global (where the owner is
     * cleared); only administrators are shown it.
     */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("exercises_owner_id_idx").on(t.ownerId),
    check(
      "exercises_scope_owner_check",
      sql`(${t.scope} = 'personal' and ${t.ownerId} is not null) or (${t.scope} = 'global' and ${t.ownerId} is null)`,
    ),
  ],
);

/** A configuration of equipment that exercises can be performed at. */
export const stations = pgTable(
  "stations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    scope: libraryScope("scope").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "restrict" }),
    /** Who created the item; see exercises.createdBy. */
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("stations_owner_id_idx").on(t.ownerId),
    check(
      "stations_scope_owner_check",
      sql`(${t.scope} = 'personal' and ${t.ownerId} is not null) or (${t.scope} = 'global' and ${t.ownerId} is null)`,
    ),
  ],
);

/** One line of a station's needed equipment. Equipment in use cannot be deleted. */
export const stationEquipment = pgTable(
  "station_equipment",
  {
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.stationId, t.equipmentId] }),
    index("station_equipment_equipment_id_idx").on(t.equipmentId),
    check("station_equipment_quantity_check", sql`${t.quantity} >= 1`),
  ],
);

export const stationLayoutItemKind = pgEnum("station_layout_item_kind", ["equipment", "arrow", "text"]);

/**
 * One thing drawn in a station's layout (docs/data-model.md, "Station layout
 * item"): a piece of the station's equipment in one of its configurations, an
 * arrow or a short text. Positions are whole centimetres from the station's
 * centre. Equipment must be a line of the station's equipment, so removing
 * the line removes its items; a configuration placed here cannot be deleted.
 */
export const stationLayoutItems = pgTable(
  "station_layout_items",
  {
    id: uuid("id").primaryKey(),
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    kind: stationLayoutItemKind("kind").notNull(),
    /** Equipment items only. */
    equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "restrict" }),
    configurationId: uuid("configuration_id").references(() => equipmentConfigurations.id, {
      onDelete: "restrict",
    }),
    /** Arrows only: the arrow's length. */
    lengthCm: integer("length_cm"),
    /** Texts only. */
    text: text("text"),
    xCm: integer("x_cm").notNull(),
    yCm: integer("y_cm").notNull(),
    rotation: doublePrecision("rotation").notNull().default(0),
    layer: integer("layer").notNull(),
    label: text("label"),
  },
  (t) => [
    index("station_layout_items_station_id_idx").on(t.stationId),
    index("station_layout_items_equipment_id_idx").on(t.equipmentId),
    index("station_layout_items_configuration_id_idx").on(t.configurationId),
    foreignKey({
      name: "station_layout_items_station_equipment_fk",
      columns: [t.stationId, t.equipmentId],
      foreignColumns: [stationEquipment.stationId, stationEquipment.equipmentId],
    }).onDelete("cascade"),
    check(
      "station_layout_items_kind_check",
      sql`(${t.kind} = 'equipment' and ${t.equipmentId} is not null and ${t.configurationId} is not null and ${t.lengthCm} is null and ${t.text} is null) or (${t.kind} = 'arrow' and ${t.equipmentId} is null and ${t.configurationId} is null and ${t.lengthCm} between 10 and 5000 and ${t.text} is null) or (${t.kind} = 'text' and ${t.equipmentId} is null and ${t.configurationId} is null and ${t.lengthCm} is null and length(${t.text}) between 1 and 200)`,
    ),
    check(
      "station_layout_items_position_check",
      sql`${t.xCm} between -2500 and 2500 and ${t.yCm} between -2500 and 2500`,
    ),
    check("station_layout_items_rotation_check", sql`${t.rotation} >= 0 and ${t.rotation} < 360`),
  ],
);

/** An exercise a station supports. */
export const stationExercises = pgTable(
  "station_exercises",
  {
    stationId: uuid("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.stationId, t.exerciseId] }),
    index("station_exercises_exercise_id_idx").on(t.exerciseId),
  ],
);

export const submissionStatus = pgEnum("submission_status", ["pending", "approved", "rejected"]);

/**
 * A request to make a personal exercise or station global. It points at
 * exactly one item and is deleted with it. An item has at most one pending
 * submission; reviewed ones stay as its history, the newest giving the status
 * the submitter sees. A withdrawn submission is deleted.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exerciseId: uuid("exercise_id").references(() => exercises.id, { onDelete: "cascade" }),
    stationId: uuid("station_id").references(() => stations.id, { onDelete: "cascade" }),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: submissionStatus("status").notNull().default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewComment: text("review_comment"),
  },
  (t) => [
    index("submissions_exercise_id_idx").on(t.exerciseId),
    index("submissions_station_id_idx").on(t.stationId),
    index("submissions_submitted_by_idx").on(t.submittedBy),
    uniqueIndex("submissions_pending_exercise_unique")
      .on(t.exerciseId)
      .where(sql`${t.status} = 'pending'`),
    uniqueIndex("submissions_pending_station_unique")
      .on(t.stationId)
      .where(sql`${t.status} = 'pending'`),
    check("submissions_one_item_check", sql`num_nonnulls(${t.exerciseId}, ${t.stationId}) = 1`),
    check(
      "submissions_reviewed_check",
      sql`(${t.status} = 'pending') = (${t.reviewedAt} is null)`,
    ),
    check(
      "submissions_reject_comment_check",
      sql`${t.status} <> 'rejected' or length(trim(coalesce(${t.reviewComment}, ''))) > 0`,
    ),
  ],
);

/**
 * A personal exercise included in a station submission, so that it can become
 * global together with the station. Only the submitter's own personal
 * exercises that the station supports are included. Removed with either the
 * submission or the exercise.
 */
export const submissionExercises = pgTable(
  "submission_exercises",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    exerciseId: uuid("exercise_id")
      .notNull()
      .references(() => exercises.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.submissionId, t.exerciseId] }),
    index("submission_exercises_exercise_id_idx").on(t.exerciseId),
  ],
);

// --- Sharing -------------------------------------------------------------------

export const shareLevel = pgEnum("share_level", ["view", "edit"]);

/**
 * Gives one person access to exactly one group, season or session.
 *
 * The share is made out to an email address (stored lower-case). Until that
 * person signs in for the first time `userId` is null and the share waits;
 * it is attached to the user when their row is created, or at once when the
 * address already belongs to a user.
 */
export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    groupId: uuid("group_id").references(() => groups.id, { onDelete: "cascade" }),
    seasonId: uuid("season_id").references(() => seasons.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").references(() => sessions.id, { onDelete: "cascade" }),
    level: shareLevel("level").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("shares_user_id_idx").on(t.userId),
    index("shares_email_idx").on(t.email),
    // NULLs are distinct, so each constraint only applies to its own kind.
    unique("shares_email_group_id_unique").on(t.email, t.groupId),
    unique("shares_email_season_id_unique").on(t.email, t.seasonId),
    unique("shares_email_session_id_unique").on(t.email, t.sessionId),
    check(
      "shares_one_resource_check",
      sql`num_nonnulls(${t.groupId}, ${t.seasonId}, ${t.sessionId}) = 1`,
    ),
    check("shares_email_lower_check", sql`${t.email} = lower(${t.email})`),
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
  sessions: many(sessions),
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

export const sessionsRelations = relations(sessions, ({ one, many }) => ({
  season: one(seasons, { fields: [sessions.seasonId], references: [seasons.id] }),
  trainingSlot: one(trainingSlots, {
    fields: [sessions.trainingSlotId],
    references: [trainingSlots.id],
  }),
  parts: many(sessionParts),
  attachments: many(attachments),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  session: one(sessions, { fields: [attachments.sessionId], references: [sessions.id] }),
}));

export const sessionPartsRelations = relations(sessionParts, ({ one, many }) => ({
  session: one(sessions, { fields: [sessionParts.sessionId], references: [sessions.id] }),
  discipline: one(disciplines, {
    fields: [sessionParts.disciplineId],
    references: [disciplines.id],
  }),
  activities: many(activities),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  part: one(sessionParts, {
    fields: [activities.sessionPartId],
    references: [sessionParts.id],
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
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type SessionPart = typeof sessionParts.$inferSelect;
export type NewSessionPart = typeof sessionParts.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type ActivityExercise = typeof activityExercises.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type LibraryScope = (typeof libraryScope.enumValues)[number];
export type Equipment = typeof equipment.$inferSelect;
export type EquipmentConfiguration = typeof equipmentConfigurations.$inferSelect;
export type Hall = typeof halls.$inferSelect;
export type HallFeature = typeof hallFeatures.$inferSelect;
export type HallFeatureKind = (typeof hallFeatureKind.enumValues)[number];
export type Exercise = typeof exercises.$inferSelect;
export type NewExercise = typeof exercises.$inferInsert;
export type Station = typeof stations.$inferSelect;
export type NewStation = typeof stations.$inferInsert;
export type StationEquipment = typeof stationEquipment.$inferSelect;
export type StationExercise = typeof stationExercises.$inferSelect;
export type StationLayoutItem = typeof stationLayoutItems.$inferSelect;
export type StationLayoutItemKind = (typeof stationLayoutItemKind.enumValues)[number];
export type Submission = typeof submissions.$inferSelect;
export type SubmissionExercise = typeof submissionExercises.$inferSelect;
export type SubmissionStatus = (typeof submissionStatus.enumValues)[number];
export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
export type ShareLevel = (typeof shareLevel.enumValues)[number];
