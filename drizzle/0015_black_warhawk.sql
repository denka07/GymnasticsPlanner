CREATE TYPE "public"."station_layout_item_kind" AS ENUM('equipment', 'arrow', 'text');--> statement-breakpoint
CREATE TABLE "station_layout_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"station_id" uuid NOT NULL,
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
	CONSTRAINT "station_layout_items_kind_check" CHECK (("station_layout_items"."kind" = 'equipment' and "station_layout_items"."equipment_id" is not null and "station_layout_items"."configuration_id" is not null and "station_layout_items"."length_cm" is null and "station_layout_items"."text" is null) or ("station_layout_items"."kind" = 'arrow' and "station_layout_items"."equipment_id" is null and "station_layout_items"."configuration_id" is null and "station_layout_items"."length_cm" between 10 and 2000 and "station_layout_items"."text" is null) or ("station_layout_items"."kind" = 'text' and "station_layout_items"."equipment_id" is null and "station_layout_items"."configuration_id" is null and "station_layout_items"."length_cm" is null and length("station_layout_items"."text") between 1 and 200)),
	CONSTRAINT "station_layout_items_position_check" CHECK ("station_layout_items"."x_cm" between -1000 and 1000 and "station_layout_items"."y_cm" between -1000 and 1000),
	CONSTRAINT "station_layout_items_rotation_check" CHECK ("station_layout_items"."rotation" >= 0 and "station_layout_items"."rotation" < 360)
);
--> statement-breakpoint
ALTER TABLE "station_layout_items" ADD CONSTRAINT "station_layout_items_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_layout_items" ADD CONSTRAINT "station_layout_items_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_layout_items" ADD CONSTRAINT "station_layout_items_configuration_id_equipment_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."equipment_configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_layout_items" ADD CONSTRAINT "station_layout_items_station_equipment_fk" FOREIGN KEY ("station_id","equipment_id") REFERENCES "public"."station_equipment"("station_id","equipment_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "station_layout_items_station_id_idx" ON "station_layout_items" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "station_layout_items_equipment_id_idx" ON "station_layout_items" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "station_layout_items_configuration_id_idx" ON "station_layout_items" USING btree ("configuration_id");