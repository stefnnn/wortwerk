CREATE TYPE "public"."git_provider" AS ENUM('github', 'bitbucket');--> statement-breakpoint
ALTER TYPE "public"."sync_run_kind" ADD VALUE 'pull';--> statement-breakpoint
ALTER TYPE "public"."sync_run_kind" ADD VALUE 'push';--> statement-breakpoint
ALTER TYPE "public"."sync_run_kind" ADD VALUE 'machine';--> statement-breakpoint
CREATE TABLE "git_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" "git_provider" NOT NULL,
	"external_id" text NOT NULL,
	"account_name" text NOT NULL,
	"credentials" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "git_connection_tenantId_provider_externalId_unique" UNIQUE("tenant_id","provider","external_id")
);
--> statement-breakpoint
CREATE TABLE "project_repo" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"connection_id" text NOT NULL,
	"repo" text NOT NULL,
	"branch" text NOT NULL,
	"export_branch" text DEFAULT 'wortwerk/translations' NOT NULL,
	"locale_aliases" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_export" boolean DEFAULT true NOT NULL,
	"webhook_id" text,
	"webhook_secret" text,
	"last_pulled_sha" text,
	"last_pulled_at" timestamp with time zone,
	"last_pushed_sha" text,
	"last_pushed_at" timestamp with time zone,
	"pull_request_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_repo_projectId_unique" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "project_token" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"project_id" text NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_token_tokenHash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "git_connection" ADD CONSTRAINT "git_connection_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "git_connection" ADD CONSTRAINT "git_connection_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo" ADD CONSTRAINT "project_repo_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo" ADD CONSTRAINT "project_repo_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_repo" ADD CONSTRAINT "project_repo_connection_id_git_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."git_connection"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_token" ADD CONSTRAINT "project_token_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_token" ADD CONSTRAINT "project_token_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_token" ADD CONSTRAINT "project_token_created_by_id_user_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "git_connection_provider_external_id_index" ON "git_connection" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "project_repo_connection_id_repo_index" ON "project_repo" USING btree ("connection_id","repo");--> statement-breakpoint
CREATE INDEX "project_token_project_id_index" ON "project_token" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "translation_tenant_id_updated_at_index" ON "translation" USING btree ("tenant_id","updated_at");