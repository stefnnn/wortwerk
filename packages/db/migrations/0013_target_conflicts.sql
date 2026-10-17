ALTER TYPE "public"."conflict_resolution" ADD VALUE 'wortwerk' BEFORE 'edited';--> statement-breakpoint
DROP INDEX "source_conflict_key_id_index";--> statement-breakpoint
ALTER TABLE "source_conflict" ADD COLUMN "locale" text;--> statement-breakpoint
-- every conflict so far is about source text
UPDATE "source_conflict" c SET "locale" = p."source_locale"
FROM "translation_key" k, "project" p
WHERE k."id" = c."key_id" AND p."id" = k."project_id";--> statement-breakpoint
ALTER TABLE "source_conflict" ALTER COLUMN "locale" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "source_conflict_key_id_locale_index" ON "source_conflict" USING btree ("key_id","locale");
