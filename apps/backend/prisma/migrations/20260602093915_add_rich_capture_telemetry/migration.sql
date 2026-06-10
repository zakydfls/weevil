-- CreateEnum
CREATE TYPE "CaptureSessionStatus" AS ENUM ('STARTED', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PageActionKind" AS ENUM ('CLICK', 'DOUBLE_CLICK', 'INPUT', 'KEY_PRESS', 'SCROLL', 'HOVER', 'FORM_SUBMIT', 'NAVIGATION', 'ROUTE_CHANGE', 'VISIBILITY_CHANGE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RuntimeErrorKind" AS ENUM ('JS_ERROR', 'UNHANDLED_REJECTION', 'RESOURCE_ERROR', 'CSP_VIOLATION', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PerformanceEntryKind" AS ENUM ('NAVIGATION', 'RESOURCE', 'PAINT', 'MARK', 'MEASURE', 'WEB_VITAL', 'MEMORY', 'LONG_TASK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DomEventKind" AS ENUM ('SNAPSHOT', 'MUTATION', 'SELECTION', 'FOCUS', 'BLUR', 'CUSTOM');

-- CreateEnum
CREATE TYPE "BackendTraceStatus" AS ENUM ('OK', 'ERROR', 'UNKNOWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReportEventKind" ADD VALUE 'CAPTURE_SESSION_STARTED';
ALTER TYPE "ReportEventKind" ADD VALUE 'CAPTURE_SESSION_COMPLETED';
ALTER TYPE "ReportEventKind" ADD VALUE 'ACTIONS_ATTACHED';
ALTER TYPE "ReportEventKind" ADD VALUE 'RUNTIME_ERRORS_ATTACHED';
ALTER TYPE "ReportEventKind" ADD VALUE 'PERFORMANCE_ENTRIES_ATTACHED';
ALTER TYPE "ReportEventKind" ADD VALUE 'DOM_EVENTS_ATTACHED';
ALTER TYPE "ReportEventKind" ADD VALUE 'BACKEND_TRACES_ATTACHED';

-- AlterTable
ALTER TABLE "console_log_entries" ADD COLUMN     "offsetMs" INTEGER,
ADD COLUMN     "pageUrl" TEXT,
ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "network_request_entries" ADD COLUMN     "offsetMs" INTEGER,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "capture_sessions" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "status" "CaptureSessionStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "recordingStartedAt" TIMESTAMP(3),
    "recordingEndedAt" TIMESTAMP(3),
    "pageUrl" TEXT,
    "referrer" TEXT,
    "title" TEXT,
    "timezone" TEXT,
    "locale" TEXT,
    "userAgent" TEXT,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "osName" TEXT,
    "extensionVersion" TEXT,
    "manifestVersion" TEXT,
    "tabId" TEXT,
    "windowId" TEXT,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "devicePixelRatio" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capture_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_action_entries" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "PageActionKind" NOT NULL,
    "selector" TEXT,
    "nodePath" TEXT,
    "label" TEXT,
    "tagName" TEXT,
    "textPreview" TEXT,
    "valuePreview" TEXT,
    "pageUrl" TEXT,
    "x" INTEGER,
    "y" INTEGER,
    "scrollX" INTEGER,
    "scrollY" INTEGER,
    "offsetMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_action_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runtime_error_entries" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "RuntimeErrorKind" NOT NULL,
    "message" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "lineNumber" INTEGER,
    "columnNumber" INTEGER,
    "stack" TEXT,
    "componentStack" TEXT,
    "pageUrl" TEXT,
    "offsetMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "runtime_error_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "performance_entries" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "PerformanceEntryKind" NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "startTimeMs" DOUBLE PRECISION,
    "durationMs" DOUBLE PRECISION,
    "rating" TEXT,
    "initiatorType" TEXT,
    "pageUrl" TEXT,
    "offsetMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dom_event_entries" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sessionId" TEXT,
    "kind" "DomEventKind" NOT NULL,
    "selector" TEXT,
    "nodePath" TEXT,
    "mutationType" TEXT,
    "previousValue" TEXT,
    "nextValue" TEXT,
    "pageUrl" TEXT,
    "offsetMs" INTEGER,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "attributes" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dom_event_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "backend_trace_entries" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sessionId" TEXT,
    "traceId" TEXT,
    "spanId" TEXT,
    "parentSpanId" TEXT,
    "serviceName" TEXT,
    "operationName" TEXT NOT NULL,
    "status" "BackendTraceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "method" TEXT,
    "url" TEXT,
    "statusCode" INTEGER,
    "durationMs" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "offsetMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "backend_trace_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capture_sessions_reportId_status_startedAt_idx" ON "capture_sessions"("reportId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "page_action_entries_reportId_occurredAt_idx" ON "page_action_entries"("reportId", "occurredAt");

-- CreateIndex
CREATE INDEX "page_action_entries_sessionId_offsetMs_idx" ON "page_action_entries"("sessionId", "offsetMs");

-- CreateIndex
CREATE INDEX "runtime_error_entries_reportId_kind_occurredAt_idx" ON "runtime_error_entries"("reportId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "runtime_error_entries_sessionId_offsetMs_idx" ON "runtime_error_entries"("sessionId", "offsetMs");

-- CreateIndex
CREATE INDEX "performance_entries_reportId_kind_occurredAt_idx" ON "performance_entries"("reportId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "performance_entries_sessionId_offsetMs_idx" ON "performance_entries"("sessionId", "offsetMs");

-- CreateIndex
CREATE INDEX "dom_event_entries_reportId_kind_occurredAt_idx" ON "dom_event_entries"("reportId", "kind", "occurredAt");

-- CreateIndex
CREATE INDEX "dom_event_entries_sessionId_offsetMs_idx" ON "dom_event_entries"("sessionId", "offsetMs");

-- CreateIndex
CREATE INDEX "backend_trace_entries_reportId_status_startedAt_idx" ON "backend_trace_entries"("reportId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "backend_trace_entries_traceId_idx" ON "backend_trace_entries"("traceId");

-- CreateIndex
CREATE INDEX "backend_trace_entries_sessionId_offsetMs_idx" ON "backend_trace_entries"("sessionId", "offsetMs");

-- CreateIndex
CREATE INDEX "console_log_entries_sessionId_offsetMs_idx" ON "console_log_entries"("sessionId", "offsetMs");

-- CreateIndex
CREATE INDEX "network_request_entries_sessionId_offsetMs_idx" ON "network_request_entries"("sessionId", "offsetMs");

-- AddForeignKey
ALTER TABLE "capture_sessions" ADD CONSTRAINT "capture_sessions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_action_entries" ADD CONSTRAINT "page_action_entries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_action_entries" ADD CONSTRAINT "page_action_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "capture_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_error_entries" ADD CONSTRAINT "runtime_error_entries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runtime_error_entries" ADD CONSTRAINT "runtime_error_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "capture_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_entries" ADD CONSTRAINT "performance_entries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "performance_entries" ADD CONSTRAINT "performance_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "capture_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dom_event_entries" ADD CONSTRAINT "dom_event_entries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dom_event_entries" ADD CONSTRAINT "dom_event_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "capture_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backend_trace_entries" ADD CONSTRAINT "backend_trace_entries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backend_trace_entries" ADD CONSTRAINT "backend_trace_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "capture_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "console_log_entries" ADD CONSTRAINT "console_log_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "capture_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_request_entries" ADD CONSTRAINT "network_request_entries_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "capture_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
