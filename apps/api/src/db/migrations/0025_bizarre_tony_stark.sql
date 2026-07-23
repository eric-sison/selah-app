CREATE TYPE "public"."stem_separation_status" AS ENUM('pending', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "song_stems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"status" "stem_separation_status" DEFAULT 'pending' NOT NULL,
	"vocals_storage_key" text,
	"drums_storage_key" text,
	"bass_storage_key" text,
	"other_storage_key" text,
	"error_message" text,
	"callback_token" text NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "song_stems_song_id_unique" UNIQUE("song_id")
);
--> statement-breakpoint
ALTER TABLE "song_stems" ADD CONSTRAINT "song_stems_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_stems" ADD CONSTRAINT "song_stems_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "song_stems_song_id_idx" ON "song_stems" USING btree ("song_id");