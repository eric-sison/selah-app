ALTER TABLE "lineup_members" DROP CONSTRAINT "lineup_member_lineup_user_role_unique";--> statement-breakpoint
ALTER TABLE "lineup_members" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "lineup_members" ADD CONSTRAINT "lineup_member_lineup_user_unique" UNIQUE("lineup_id","user_id");--> statement-breakpoint
DROP TYPE "public"."lineup_member_role";