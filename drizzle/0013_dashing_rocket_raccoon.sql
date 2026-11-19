CREATE TYPE "public"."hall_feature_kind" AS ENUM('wall_bars', 'door', 'port', 'storage', 'wall', 'foam_pit', 'md_pit', 'stands', 'other', 'equipment');--> statement-breakpoint
CREATE TABLE "hall_features" (
	"id" uuid PRIMARY KEY NOT NULL,
	"hall_id" uuid NOT NULL,
	"kind" "hall_feature_kind" NOT NULL,
	"equipment_id" uuid,
	"configuration_id" uuid,
	"width_cm" integer,
	"length_cm" integer,
	"color" text,
	"image_pathname" text,
	"image_content_type" text,
	"x_cm" integer NOT NULL,
	"y_cm" integer NOT NULL,
	"rotation" double precision DEFAULT 0 NOT NULL,
	"layer" integer NOT NULL,
	"label" text,
	CONSTRAINT "hall_features_kind_check" CHECK (("hall_features"."kind" = 'equipment' and "hall_features"."equipment_id" is not null and "hall_features"."configuration_id" is not null and "hall_features"."width_cm" is null and "hall_features"."length_cm" is null and "hall_features"."color" is null and "hall_features"."image_pathname" is null) or ("hall_features"."kind" <> 'equipment' and "hall_features"."equipment_id" is null and "hall_features"."configuration_id" is null and "hall_features"."width_cm" between 1 and 20000 and "hall_features"."length_cm" between 1 and 20000)),
	CONSTRAINT "hall_features_color_check" CHECK ("hall_features"."color" is null or "hall_features"."color" ~ '^#[0-9a-f]{6}$'),
	CONSTRAINT "hall_features_image_check" CHECK (("hall_features"."image_pathname" is null and "hall_features"."image_content_type" is null) or ("hall_features"."image_pathname" is not null and "hall_features"."image_content_type" in ('image/png', 'image/jpeg', 'image/webp'))),
	CONSTRAINT "hall_features_rotation_check" CHECK ("hall_features"."rotation" >= 0 and "hall_features"."rotation" < 360)
);
--> statement-breakpoint
CREATE TABLE "halls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"width_cm" integer NOT NULL,
	"length_cm" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "halls_size_check" CHECK ("halls"."width_cm" between 1 and 20000 and "halls"."length_cm" between 1 and 20000)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "hall_id" uuid;--> statement-breakpoint
ALTER TABLE "training_slots" ADD COLUMN "hall_id" uuid;--> statement-breakpoint
ALTER TABLE "hall_features" ADD CONSTRAINT "hall_features_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_features" ADD CONSTRAINT "hall_features_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hall_features" ADD CONSTRAINT "hall_features_configuration_id_equipment_configurations_id_fk" FOREIGN KEY ("configuration_id") REFERENCES "public"."equipment_configurations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hall_features_hall_id_idx" ON "hall_features" USING btree ("hall_id");--> statement-breakpoint
CREATE INDEX "hall_features_equipment_id_idx" ON "hall_features" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "hall_features_configuration_id_idx" ON "hall_features" USING btree ("configuration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "halls_name_lower_unique" ON "halls" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_slots" ADD CONSTRAINT "training_slots_hall_id_halls_id_fk" FOREIGN KEY ("hall_id") REFERENCES "public"."halls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_hall_id_idx" ON "sessions" USING btree ("hall_id");--> statement-breakpoint
CREATE INDEX "training_slots_hall_id_idx" ON "training_slots" USING btree ("hall_id");