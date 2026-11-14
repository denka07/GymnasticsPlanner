CREATE TYPE "public"."submission_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exercise_id" uuid,
	"station_id" uuid,
	"submitted_by" uuid NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_comment" text,
	CONSTRAINT "submissions_one_item_check" CHECK (num_nonnulls("submissions"."exercise_id", "submissions"."station_id") = 1),
	CONSTRAINT "submissions_reviewed_check" CHECK (("submissions"."status" = 'pending') = ("submissions"."reviewed_at" is null)),
	CONSTRAINT "submissions_reject_comment_check" CHECK ("submissions"."status" <> 'rejected' or length(trim(coalesce("submissions"."review_comment", ''))) > 0)
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "created_by" uuid;--> statement-breakpoint
-- Existing items: the owner created them. A global item has no owner, so the oldest administrator stands in.
UPDATE "exercises" SET "created_by" = coalesce("owner_id", (SELECT "id" FROM "users" WHERE "is_admin" ORDER BY "created_at" LIMIT 1));--> statement-breakpoint
ALTER TABLE "exercises" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "stations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
-- Existing items: the owner created them. A global item has no owner, so the oldest administrator stands in.
UPDATE "stations" SET "created_by" = coalesce("owner_id", (SELECT "id" FROM "users" WHERE "is_admin" ORDER BY "created_at" LIMIT 1));--> statement-breakpoint
ALTER TABLE "stations" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_exercise_id_idx" ON "submissions" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "submissions_station_id_idx" ON "submissions" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "submissions_submitted_by_idx" ON "submissions" USING btree ("submitted_by");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_pending_exercise_unique" ON "submissions" USING btree ("exercise_id") WHERE "submissions"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_pending_station_unique" ON "submissions" USING btree ("station_id") WHERE "submissions"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;