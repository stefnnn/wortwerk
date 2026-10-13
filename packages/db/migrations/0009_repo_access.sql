ALTER TABLE "git_connection" ADD COLUMN "account_type" text;--> statement-breakpoint
ALTER TABLE "project_repo" ADD COLUMN "access_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_repo" ADD COLUMN "access_lost_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "project_repo" ADD COLUMN "access_error" text;--> statement-breakpoint
ALTER TABLE "project_repo" ADD COLUMN "access_alert_sent_at" timestamp with time zone;