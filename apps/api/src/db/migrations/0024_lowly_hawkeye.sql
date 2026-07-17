ALTER TABLE "lineup_songs" ADD COLUMN "singer_id" text;--> statement-breakpoint
ALTER TABLE "lineup_songs" ADD CONSTRAINT "lineup_songs_singer_id_users_id_fk" FOREIGN KEY ("singer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineup_song_singer_id_idx" ON "lineup_songs" USING btree ("singer_id");