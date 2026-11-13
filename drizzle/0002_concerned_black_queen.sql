CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_part_id" uuid NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"title" text NOT NULL,
	"sort_order" integer NOT NULL,
	"duration_minutes" integer,
	"discipline_id" uuid,
	"is_done" boolean DEFAULT false NOT NULL,
	CONSTRAINT "session_parts_duration_check" CHECK ("session_parts"."duration_minutes" is null or "session_parts"."duration_minutes" between 1 and 600)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_time" time,
	"end_time" time,
	"location" text,
	"training_slot_id" uuid,
	"is_cancelled" boolean DEFAULT false NOT NULL,
	"note_after" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_training_slot_id_date_unique" UNIQUE("training_slot_id","date")
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_session_part_id_session_parts_id_fk" FOREIGN KEY ("session_part_id") REFERENCES "public"."session_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_parts" ADD CONSTRAINT "session_parts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_parts" ADD CONSTRAINT "session_parts_discipline_id_disciplines_id_fk" FOREIGN KEY ("discipline_id") REFERENCES "public"."disciplines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_training_slot_id_training_slots_id_fk" FOREIGN KEY ("training_slot_id") REFERENCES "public"."training_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_session_part_id_idx" ON "activities" USING btree ("session_part_id");--> statement-breakpoint
CREATE INDEX "session_parts_session_id_idx" ON "session_parts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_season_id_date_idx" ON "sessions" USING btree ("season_id","date");