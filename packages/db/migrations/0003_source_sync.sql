CREATE TYPE "public"."conflict_resolution" AS ENUM('repo', 'edited');--> statement-breakpoint
CREATE TABLE "source_conflict" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"key_id" text NOT NULL,
	"mine" text NOT NULL,
	"base" text,
	"theirs" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_id" text,
	"resolution" "conflict_resolution"
);
--> statement-breakpoint
ALTER TABLE "translation" ADD COLUMN "repo_value" text;--> statement-breakpoint
ALTER TABLE "source_conflict" ADD CONSTRAINT "source_conflict_tenant_id_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_conflict" ADD CONSTRAINT "source_conflict_key_id_translation_key_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."translation_key"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_conflict" ADD CONSTRAINT "source_conflict_resolved_by_id_user_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_conflict_key_id_index" ON "source_conflict" USING btree ("key_id");--> statement-breakpoint
CREATE INDEX "source_conflict_tenant_id_resolved_at_index" ON "source_conflict" USING btree ("tenant_id","resolved_at");--> statement-breakpoint
-- the base for source rows of repo-linked projects is the last value a pull wrote; edits made in
-- the editor since then show up as pending instead of being overwritten on the next pull
UPDATE "translation" t SET "repo_value" = r."value"
FROM (
	SELECT DISTINCT ON (rv."translation_id") rv."translation_id", rv."value"
	FROM "translation_revision" rv
	WHERE rv."source" = 'git'
	ORDER BY rv."translation_id", rv."created_at" DESC
) r, "translation_key" k, "project" p, "project_repo" pr
WHERE r."translation_id" = t."id"
	AND k."id" = t."key_id"
	AND p."id" = k."project_id"
	AND pr."project_id" = p."id"
	AND t."locale" = p."source_locale";
