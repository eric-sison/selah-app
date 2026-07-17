CREATE TYPE "public"."reaction_emoji" AS ENUM('🙏', '❤️', '🔥', '👏', '😂');--> statement-breakpoint
CREATE TABLE "lineup_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lineup_id" uuid NOT NULL,
	"author_id" text NOT NULL,
	"parent_comment_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lineup_comment_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"comment_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"emoji" "reaction_emoji" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lineup_comment_reaction_comment_user_emoji_unique" UNIQUE("comment_id","user_id","emoji")
);
--> statement-breakpoint
ALTER TABLE "lineup_comments" ADD CONSTRAINT "lineup_comments_lineup_id_lineups_id_fk" FOREIGN KEY ("lineup_id") REFERENCES "public"."lineups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_comments" ADD CONSTRAINT "lineup_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_comments" ADD CONSTRAINT "lineup_comments_parent_comment_id_lineup_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."lineup_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_comment_reactions" ADD CONSTRAINT "lineup_comment_reactions_comment_id_lineup_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."lineup_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lineup_comment_reactions" ADD CONSTRAINT "lineup_comment_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lineup_comment_lineup_id_idx" ON "lineup_comments" USING btree ("lineup_id");--> statement-breakpoint
CREATE INDEX "lineup_comment_parent_comment_id_idx" ON "lineup_comments" USING btree ("parent_comment_id");--> statement-breakpoint
CREATE INDEX "lineup_comment_reaction_comment_id_idx" ON "lineup_comment_reactions" USING btree ("comment_id");