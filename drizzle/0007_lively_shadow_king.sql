CREATE TYPE "public"."share_level" AS ENUM('view', 'edit');--> statement-breakpoint
CREATE TABLE "shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"user_id" uuid,
	"group_id" uuid,
	"season_id" uuid,
	"session_id" uuid,
	"level" "share_level" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_email_group_id_unique" UNIQUE("email","group_id"),
	CONSTRAINT "shares_email_season_id_unique" UNIQUE("email","season_id"),
	CONSTRAINT "shares_email_session_id_unique" UNIQUE("email","session_id"),
	CONSTRAINT "shares_one_resource_check" CHECK (num_nonnulls("shares"."group_id", "shares"."season_id", "shares"."session_id") = 1),
	CONSTRAINT "shares_email_lower_check" CHECK ("shares"."email" = lower("shares"."email"))
);
--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shares" ADD CONSTRAINT "shares_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shares_user_id_idx" ON "shares" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shares_email_idx" ON "shares" USING btree ("email");