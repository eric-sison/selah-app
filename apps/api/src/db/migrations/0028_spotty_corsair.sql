CREATE TYPE "public"."youtube_import_status" AS ENUM('pending', 'downloading', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "youtube_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"youtube_url" text NOT NULL,
	"video_title" text,
	"status" "youtube_import_status" DEFAULT 'pending' NOT NULL,
	"song_id" uuid,
	"error_message" text,
	"requested_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "youtube_import_jobs" ADD CONSTRAINT "youtube_import_jobs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "youtube_import_jobs" ADD CONSTRAINT "youtube_import_jobs_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "youtube_import_job_requested_by_idx" ON "youtube_import_jobs" USING btree ("requested_by");