CREATE TABLE "activity_exercises" (
	"activity_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "activity_exercises_activity_id_exercise_id_pk" PRIMARY KEY("activity_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "text" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "activity_exercises" ADD CONSTRAINT "activity_exercises_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_exercises" ADD CONSTRAINT "activity_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_exercises_exercise_id_idx" ON "activity_exercises" USING btree ("exercise_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_station_id_idx" ON "activities" USING btree ("station_id");