-- Separate the internal extension ingest capability from the user-visible share token.
ALTER TABLE "bug_reports" ADD COLUMN "ingestToken" TEXT;

CREATE UNIQUE INDEX "bug_reports_ingestToken_key" ON "bug_reports"("ingestToken");
