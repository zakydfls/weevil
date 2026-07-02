ALTER TABLE "bug_reports"
ADD COLUMN "boardColumn" TEXT NOT NULL DEFAULT 'backlog',
ADD COLUMN "boardOrder" INTEGER;

UPDATE "bug_reports"
SET "boardColumn" = 'backlog'
WHERE "boardColumn" IS NULL OR "boardColumn" = '';

CREATE INDEX "bug_reports_workspaceId_boardColumn_boardOrder_createdAt_idx"
ON "bug_reports"("workspaceId", "boardColumn", "boardOrder", "createdAt");
