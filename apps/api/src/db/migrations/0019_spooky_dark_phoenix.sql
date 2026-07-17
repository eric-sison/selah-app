CREATE TYPE "public"."instrument" AS ENUM('bass', 'drums', 'singer', 'electric_guitar', 'acoustic_guitar', 'keyboard');--> statement-breakpoint
CREATE TABLE "musicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"instruments" "instrument"[] DEFAULT '{}'::instrument[] NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "musician_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "musicians" ADD CONSTRAINT "musicians_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "musician_userId_idx" ON "musicians" USING btree ("user_id");--> statement-breakpoint
-- Data migration: gives every existing team member a musician profile
-- before team_member_roles is dropped in the next migration, folding in
-- whatever per-team roles they had (deduped across every team they were on)
-- as their starting instruments. Driven from team_members (not
-- team_member_roles) via a LEFT JOIN, since a member could exist with zero
-- roles assigned - team membership now requires a musician profile, so
-- every member needs a row here, not just the ones who had roles.
INSERT INTO "musicians" (user_id, instruments)
SELECT tm.user_id, COALESCE(array_agg(DISTINCT tmr.role::text::instrument) FILTER (WHERE tmr.role IS NOT NULL), '{}')
FROM "team_members" tm
LEFT JOIN "team_member_roles" tmr ON tmr.team_member_id = tm.id
GROUP BY tm.user_id
ON CONFLICT (user_id) DO NOTHING;