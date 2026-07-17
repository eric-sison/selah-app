CREATE TYPE "public"."lineup_service_type" AS ENUM('sunday_service', 'youth_service', 'necrological_service', 'prayer_meeting_service', 'victory_day', 'other');--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "service_type" "lineup_service_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "service_date" timestamp NOT NULL;--> statement-breakpoint
ALTER TABLE "lineups" ADD COLUMN "rehearsal_date" timestamp;