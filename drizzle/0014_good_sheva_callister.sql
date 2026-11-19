ALTER TABLE "halls" ADD COLUMN "floor_color" text DEFAULT '#ece3d0' NOT NULL;--> statement-breakpoint
ALTER TABLE "halls" ADD COLUMN "floor_image_pathname" text;--> statement-breakpoint
ALTER TABLE "halls" ADD COLUMN "floor_image_content_type" text;--> statement-breakpoint
ALTER TABLE "halls" ADD CONSTRAINT "halls_floor_color_check" CHECK ("halls"."floor_color" ~ '^#[0-9a-f]{6}$');--> statement-breakpoint
ALTER TABLE "halls" ADD CONSTRAINT "halls_floor_image_check" CHECK (("halls"."floor_image_pathname" is null and "halls"."floor_image_content_type" is null) or ("halls"."floor_image_pathname" is not null and "halls"."floor_image_content_type" in ('image/png', 'image/jpeg', 'image/webp')));