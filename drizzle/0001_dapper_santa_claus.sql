CREATE TYPE "public"."event_type" AS ENUM('competition', 'camp', 'show', 'other');--> statement-breakpoint
CREATE TYPE "public"."focus_level" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TABLE "disciplines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "event_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "events_date_order_check" CHECK ("events"."end_date" >= "events"."start_date")
);
--> statement-breakpoint
CREATE TABLE "focus_allocations" (
	"focus_item_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"level" "focus_level" NOT NULL,
	CONSTRAINT "focus_allocations_focus_item_id_week_start_pk" PRIMARY KEY("focus_item_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "focus_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discipline_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"is_break" boolean DEFAULT false NOT NULL,
	"note" text,
	CONSTRAINT "season_weeks_season_id_week_start_unique" UNIQUE("season_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"first_week" date NOT NULL,
	"last_week" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "seasons_week_order_check" CHECK ("seasons"."last_week" >= "seasons"."first_week")
);
--> statement-breakpoint
CREATE TABLE "training_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_time" time,
	"end_time" time,
	"location" text,
	CONSTRAINT "training_slots_weekday_check" CHECK ("training_slots"."weekday" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "disciplines" ADD CONSTRAINT "disciplines_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_allocations" ADD CONSTRAINT "focus_allocations_focus_item_id_focus_items_id_fk" FOREIGN KEY ("focus_item_id") REFERENCES "public"."focus_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "focus_items" ADD CONSTRAINT "focus_items_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_weeks" ADD CONSTRAINT "season_weeks_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seasons" ADD CONSTRAINT "seasons_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_slots" ADD CONSTRAINT "training_slots_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disciplines_season_id_idx" ON "disciplines" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "events_season_id_idx" ON "events" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "focus_items_discipline_id_idx" ON "focus_items" USING btree ("discipline_id");--> statement-breakpoint
CREATE INDEX "groups_owner_id_idx" ON "groups" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "season_weeks_season_id_idx" ON "season_weeks" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "seasons_group_id_idx" ON "seasons" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "training_slots_season_id_idx" ON "training_slots" USING btree ("season_id");