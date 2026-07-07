CREATE TABLE "report_assignees" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_assignees_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_assignees_reportId_userId_key"
    ON "report_assignees"("reportId", "userId");

CREATE INDEX "report_assignees_workspaceId_userId_idx"
    ON "report_assignees"("workspaceId", "userId");

CREATE INDEX "report_assignees_reportId_createdAt_idx"
    ON "report_assignees"("reportId", "createdAt");

ALTER TABLE "report_assignees"
    ADD CONSTRAINT "report_assignees_reportId_fkey"
    FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_assignees"
    ADD CONSTRAINT "report_assignees_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_assignees"
    ADD CONSTRAINT "report_assignees_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_assignees"
    ADD CONSTRAINT "report_assignees_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
