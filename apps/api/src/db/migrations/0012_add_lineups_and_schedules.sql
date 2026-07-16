CREATE TYPE "public"."lineup_member_role" AS ENUM('singer', 'musician');--> statement-breakpoint
CREATE TYPE "public"."lineup_status" AS ENUM('pending', 'approved');--> statement-breakpoint
CREATE TYPE "public"."schedule_lineup_role" AS ENUM('service', 'practice');--> statement-breakpoint
CREATE TYPE "public"."schedule_type" AS ENUM('sunday_service', 'youth_service', 'necrological_service', 'rehearsal', 'prayer_meeting_service', 'victory_day', 'other');--> statement-breakpoint
CREATE TABLE "lineups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "lineup_status" DEFAULT 'pending' NOT NULL,
	"team_id" uuid NOT NULL,
	"series_name" text NOT NULL,
	"topic" text NOT NULL,
	"word_reference" text NOT NULL,
	"word_text" text NOT NULL,
	"direction" text,
	"devo_leader_id" text,
	"approved_by" text,
	"approved_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lineup_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "lineup_member_role" NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lineup_member_lineup_user_role_unique" UNIQUE("lineup_id","user_id","role")
);
--> statement-breakpoint
CREATE TABLE "lineup_songs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lineup_id" uuid NOT NULL,
	"song_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lineup_song_lineup_song_unique" UNIQUE("lineup_id","song_id"),
	CONSTRAINT "lineup_song_lineup_position_unique" UNIQUE("lineup_id","position")
);
--> statement-breakpoint
CREATE TABLE "schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "schedule_type" NOT NULL,
	"lineup_id" uuid,
	"lineup_role" "schedule_lineup_role",
	"title" text,
	"start_at" timestamp NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_lineup_role_unique" UNIQUE("lineup_id","lineup_role")
);
--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_devo_leader_id_users_id_fk" FOREIGN KEY ("devo_leader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineups" ADD CONSTRAINT "lineups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_members" ADD CONSTRAINT "lineup_members_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_members" ADD CONSTRAINT "lineup_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_songs" ADD CONSTRAINT "lineup_songs_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_songs" ADD CONSTRAINT "lineup_songs_song_id_songs_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."songs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineup_team_id_idx" ON "lineups" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "lineup_devo_leader_id_idx" ON "lineups" USING btree ("devo_leader_id");--> statement-breakpoint
CREATE INDEX "lineup_member_lineup_id_idx" ON "lineup_members" USING btree ("lineup_id");--> statement-breakpoint
CREATE INDEX "lineup_member_user_id_idx" ON "lineup_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "lineup_song_lineup_id_idx" ON "lineup_songs" USING btree ("lineup_id");--> statement-breakpoint
CREATE INDEX "lineup_song_song_id_idx" ON "lineup_songs" USING btree ("song_id");--> statement-breakpoint
CREATE INDEX "schedule_lineup_id_idx" ON "schedules" USING btree ("lineup_id");--> statement-breakpoint
CREATE INDEX "schedule_start_at_idx" ON "schedules" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "schedule_type_idx" ON "schedules" USING btree ("type");