CREATE TABLE "equipment_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"equipment_id" uuid NOT NULL,
	"name" text NOT NULL,
	"width_cm" integer NOT NULL,
	"length_cm" integer NOT NULL,
	"image_pathname" text,
	"image_content_type" text,
	"color" text,
	"sort_order" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_configurations_size_check" CHECK ("equipment_configurations"."width_cm" between 1 and 5000 and "equipment_configurations"."length_cm" between 1 and 5000),
	CONSTRAINT "equipment_configurations_color_check" CHECK ("equipment_configurations"."color" is null or "equipment_configurations"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "equipment_configurations_image_check" CHECK (("equipment_configurations"."image_pathname" is null and "equipment_configurations"."image_content_type" is null) or ("equipment_configurations"."image_pathname" is not null and "equipment_configurations"."image_content_type" in ('image/png', 'image/jpeg', 'image/webp')))
);
--> statement-breakpoint
ALTER TABLE "equipment_configurations" ADD CONSTRAINT "equipment_configurations_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_configurations_name_lower_unique" ON "equipment_configurations" USING btree ("equipment_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "equipment_configurations_one_default" ON "equipment_configurations" USING btree ("equipment_id") WHERE "equipment_configurations"."is_default";