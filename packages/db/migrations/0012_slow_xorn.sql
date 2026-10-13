ALTER TABLE "project" ALTER COLUMN "auto_translate" SET DEFAULT true;--> statement-breakpoint
UPDATE "project" SET "auto_translate" = true;