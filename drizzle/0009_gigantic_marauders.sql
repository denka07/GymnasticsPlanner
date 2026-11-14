CREATE TABLE "submission_exercises" (
	"submission_id" uuid NOT NULL,
	"exercise_id" uuid NOT NULL,
	CONSTRAINT "submission_exercises_submission_id_exercise_id_pk" PRIMARY KEY("submission_id","exercise_id")
);
--> statement-breakpoint
ALTER TABLE "submission_exercises" ADD CONSTRAINT "submission_exercises_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_exercises" ADD CONSTRAINT "submission_exercises_exercise_id_exercises_id_fk" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submission_exercises_exercise_id_idx" ON "submission_exercises" USING btree ("exercise_id");