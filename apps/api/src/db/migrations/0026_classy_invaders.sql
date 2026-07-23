CREATE TYPE "public"."stem_quality" AS ENUM('fast', 'high', 'max');--> statement-breakpoint
ALTER TABLE "song_stems" ADD COLUMN "quality" "stem_quality" DEFAULT 'fast' NOT NULL;--> statement-breakpoint
ALTER TABLE "song_stems" ADD COLUMN "guitar_storage_key" text;--> statement-breakpoint
ALTER TABLE "song_stems" ADD COLUMN "piano_storage_key" text;