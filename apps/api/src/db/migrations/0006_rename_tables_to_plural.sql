-- Custom SQL migration file, put your code below! --
ALTER TABLE "user" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "session" RENAME TO "sessions";--> statement-breakpoint
ALTER TABLE "account" RENAME TO "accounts";--> statement-breakpoint
ALTER TABLE "verification" RENAME TO "verifications";--> statement-breakpoint
ALTER TABLE "invitation" RENAME TO "invitations";--> statement-breakpoint
ALTER TABLE "song" RENAME TO "songs";