-- Database-level integrity checks (Prisma schema cannot express CHECK constraints).
ALTER TABLE "Task" ADD CONSTRAINT "Task_position_nonnegative" CHECK ("position" >= 0);
ALTER TABLE "Task" ADD CONSTRAINT "Task_title_not_blank" CHECK (length(btrim("title")) > 0);
ALTER TABLE "Task" ADD CONSTRAINT "Task_revision_nonnegative" CHECK ("revision" >= 0);

-- The single board row.
INSERT INTO "Board" ("id", "title", "revision") VALUES ('main', 'Product Roadmap', 0) ON CONFLICT ("id") DO NOTHING;
