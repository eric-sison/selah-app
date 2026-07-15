ALTER TABLE "teams" ADD COLUMN "team_leader_id" text;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_team_leader_id_users_id_fk" FOREIGN KEY ("team_leader_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_teamLeaderId_idx" ON "teams" USING btree ("team_leader_id");