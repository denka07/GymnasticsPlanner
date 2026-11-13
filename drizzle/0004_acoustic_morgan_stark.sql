CREATE TYPE "public"."library_scope" AS ENUM('global', 'personal');--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"focus_cues" text[] DEFAULT '{}'::text[] NOT NULL,
	"easier_variant" text,
	"harder_variant" text,
	"discipline_name" text,
	"scope" "library_scope" NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exercises_scope_owner_check" CHECK (("exercises"."scope" = 'personal' and "exercises"."owner_id" is not null) or ("exercises"."scope" = 'global' and "exercises"."owner_id" is null))
);
--> statement-breakpoint
CREATE TABLE "station_equipment" (
	"station_id" uuid NOT NULL,
	"equipment_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "station_equipment_station_id_equipment_id_pk" PRIMARY KEY("station_id","equipment_id"),
	CONSTRAINT "station_equipment_quantity_check" CHECK ("station_equipment"."quantity" >= 1)
);
--> statement-breakpoint
CREATE TABLE "station_exercises" (
	"station_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	CONSTRAINT "station_exercises_station_id_exercise_id_pk" PRIMARY KEY("station_id","exercise_id")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"scope" "library_scope" NOT NULL,
	"owner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stations_scope_owner_check" CHECK (("stations"."scope" = 'personal' and "stations"."owner_id" is not null) or ("stations"."scope" = 'global' and "stations"."owner_id" is null))
);
--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_equipment" ADD CONSTRAINT "station_equipment_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_equipment" ADD CONSTRAINT "station_equipment_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_exercises" ADD CONSTRAINT "station_exercises_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_exercises" ADD CONSTRAINT "station_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_name_lower_unique" ON "equipment" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "exercises_owner_id_idx" ON "exercises" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "station_equipment_equipment_id_idx" ON "station_equipment" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "station_exercises_exercise_id_idx" ON "station_exercises" USING btree ("exercise_id");--> statement-breakpoint
CREATE INDEX "stations_owner_id_idx" ON "stations" USING btree ("owner_id");