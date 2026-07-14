CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "song_title_trgm_idx" ON "songs" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "song_artist_trgm_idx" ON "songs" USING gin ("artist" gin_trgm_ops);