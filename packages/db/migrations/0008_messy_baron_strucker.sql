CREATE TYPE "public"."cli_setup_status" AS ENUM('pending', 'claimed', 'completed', 'denied', 'consumed');--> statement-breakpoint
CREATE TABLE "cli_setup" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code_hash" text NOT NULL,
	"user_code" text NOT NULL,
	"client_name" text NOT NULL,
	"status" "cli_setup_status" DEFAULT 'pending' NOT NULL,
	"proposal" jsonb NOT NULL,
	"expected_user_id" text,
	"user_id" text,
	"tenant_id" text,
	"project_id" text,
	"connection_id" text,
	"run_id" text,
	"warning" text,
	"expires_at" timestamp with time zone NOT NULL,
	"last_polled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cli_setup_deviceCodeHash_unique" UNIQUE("device_code_hash"),
	CONSTRAINT "cli_setup_userCode_unique" UNIQUE("user_code")
);
--> statement-breakpoint
ALTER TABLE "cli_setup" ADD CONSTRAINT "cli_setup_expected_user_id_user_id_fk" FOREIGN KEY ("expected_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_setup" ADD CONSTRAINT "cli_setup_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_setup" ADD CONSTRAINT "cli_setup_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_setup" ADD CONSTRAINT "cli_setup_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_setup" ADD CONSTRAINT "cli_setup_connection_id_git_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."git_connection"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cli_setup" ADD CONSTRAINT "cli_setup_run_id_sync_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."sync_run"("id") ON DELETE set null ON UPDATE no action;