CREATE TYPE "public"."plan_item_kind" AS ENUM('equipment', 'station', 'text', 'area', 'person', 'arrow');--> statement-breakpoint
CREATE TYPE "public"."plan_person_role" AS ENUM('coach', 'passare');--> statement-breakpoint
CREATE TABLE "plan_item_layout_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_item_id" uuid NOT NULL,
	"kind" "station_layout_item_kind" NOT NULL,
	"equipment_id" uuid,
	"configuration_id" uuid,
	"length_cm" integer,
	"text" text,
	"x_cm" integer NOT NULL,
	"y_cm" integer NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"layer" integer NOT NULL,
	"label" text,
	CONSTRAINT "plan_item_layout_items_kind_check" CHECK (("plan_item_layout_items"."kind" = 'equipment' and "plan_item_layout_items"."equipment_id" is not null and "plan_item_layout_items"."configuration_id" is not null and "plan_item_layout_items"."length_cm" is null and "plan_item_layout_items"."text" is null) or ("plan_item_layout_items"."kind" = 'arrow' and "plan_item_layout_items"."equipment_id" is null and "plan_item_layout_items"."configuration_id" is null and "plan_item_layout_items"."length_cm" between 10 and 5000 and "plan_item_layout_items"."text" is null) or ("plan_item_layout_items"."kind" = 'text' and "plan_item_layout_items"."equipment_id" is null and "plan_item_layout_items"."configuration_id" is null and "plan_item_layout_items"."length_cm" is null and length("plan_item_layout_items"."text") between 1 and 200)),
	CONSTRAINT "plan_item_layout_items_position_check" CHECK ("plan_item_layout_items"."x_cm" between -2500 and 2500 and "plan_item_layout_items"."y_cm" between -2500 and 2500),
	CONSTRAINT "plan_item_layout_items_rotation_check" CHECK ("plan_item_layout_items"."rotation" >= 0 and "plan_item_layout_items"."rotation" < 360)
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"kind" "plan_item_kind" NOT NULL,
	"equipment_id" uuid,
	"configuration_id" uuid,
	"station_id" uuid,
	"activity_id" uuid,
	"is_adapted" boolean DEFAULT false NOT NULL,
	"station_name" text,
	"person_role" "plan_person_role",
	"width_cm" integer,
	"length_cm" integer,
	"text" text,
	"x_cm" integer NOT NULL,
	"y_cm" integer NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"layer" integer NOT NULL,
	"label" text,
	CONSTRAINT "plan_items_plan_id_activity_id_unique" UNIQUE("plan_id","activity_id"),
	CONSTRAINT "plan_items_kind_check" CHECK (("plan_items"."kind" = 'equipment' and "plan_items"."equipment_id" is not null and "plan_items"."configuration_id" is not null)
        or ("plan_items"."kind" = 'station' and ("plan_items"."station_id" is not null or "plan_items"."is_adapted") and (not "plan_items"."is_adapted" or "plan_items"."station_name" is not null))
        or ("plan_items"."kind" = 'text' and length("plan_items"."text") between 1 and 200)
        or ("plan_items"."kind" = 'area' and "plan_items"."width_cm" between 1 and 20000 and "plan_items"."length_cm" between 1 and 20000)
        or ("plan_items"."kind" = 'person' and "plan_items"."person_role" is not null)
        or ("plan_items"."kind" = 'arrow' and "plan_items"."length_cm" between 10 and 5000)),
	CONSTRAINT "plan_items_position_check" CHECK ("plan_items"."x_cm" between 0 and 20000 and "plan_items"."y_cm" between 0 and 20000),
	CONSTRAINT "plan_items_rotation_check" CHECK ("plan_items"."rotation" >= 0 and "plan_items"."rotation" < 360)
);
--> statement-breakpoint
CREATE TABLE "session_plan_parts" (
	"session_part_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan_item_layout_items" ADD CONSTRAINT "plan_item_layout_items_plan_item_id_plan_items_id_fk" FOREIGN KEY ("plan_item_id") REFERENCES "public"."plan_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item_layout_items" ADD CONSTRAINT "plan_item_layout_items_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_item_layout_items" ADD CONSTRAINT "plan_item_layout_items_configuration_id_equipment_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."equipment_configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_id_session_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."session_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_configuration_id_equipment_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."equipment_configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_parts" ADD CONSTRAINT "session_plan_parts_session_part_id_session_parts_id_fk" FOREIGN KEY ("session_part_id") REFERENCES "public"."session_parts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plan_parts" ADD CONSTRAINT "session_plan_parts_plan_id_session_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."session_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_plans" ADD CONSTRAINT "session_plans_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_item_layout_items_plan_item_id_idx" ON "plan_item_layout_items" USING btree ("plan_item_id");--> statement-breakpoint
CREATE INDEX "plan_item_layout_items_equipment_id_idx" ON "plan_item_layout_items" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "plan_item_layout_items_configuration_id_idx" ON "plan_item_layout_items" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX "plan_items_plan_id_idx" ON "plan_items" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_items_equipment_id_idx" ON "plan_items" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "plan_items_configuration_id_idx" ON "plan_items" USING btree ("configuration_id");--> statement-breakpoint
CREATE INDEX "plan_items_station_id_idx" ON "plan_items" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "plan_items_activity_id_idx" ON "plan_items" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "session_plan_parts_plan_id_idx" ON "session_plan_parts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "session_plans_session_id_idx" ON "session_plans" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_plans_one_main" ON "session_plans" USING btree ("session_id") WHERE "session_plans"."is_main";