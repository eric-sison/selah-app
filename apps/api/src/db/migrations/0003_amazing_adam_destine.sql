CREATE TABLE "song" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"musical_key" text,
	"tempo" integer,
	"storage_key" text NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "song_uploaded_by_idx" ON "song" USING btree ("uploaded_by");