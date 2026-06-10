-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WorkspaceStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReportSource" AS ENUM ('EXTENSION', 'DASHBOARD', 'API');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'UPLOADING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UploadKind" AS ENUM ('SCREEN_RECORDING', 'CONSOLE_LOGS', 'NETWORK_LOGS', 'SCREENSHOT', 'DOM_SNAPSHOT', 'HAR', 'OTHER');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('PENDING', 'UPLOADED', 'PROCESSING', 'READY', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportEventKind" AS ENUM ('REPORT_CREATED', 'UPLOAD_CREATED', 'UPLOAD_COMPLETED', 'PROCESSING_STARTED', 'PROCESSING_COMPLETED', 'PROCESSING_FAILED', 'CONSOLE_LOGS_ATTACHED', 'NETWORK_LOGS_ATTACHED');

-- CreateEnum
CREATE TYPE "ConsoleLogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "email" TEXT,
    "displayName" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "ReportSource" NOT NULL DEFAULT 'EXTENSION',
    "shareToken" TEXT NOT NULL,
    "pageUrl" TEXT,
    "userAgent" TEXT,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "osName" TEXT,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "metadata" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_uploads" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "kind" "UploadKind" NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'PENDING',
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" BIGINT,
    "checksumSha256" TEXT,
    "uploadSession" TEXT,
    "metadata" JSONB,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "report_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_events" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "kind" "ReportEventKind" NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_log_entries" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "level" "ConsoleLogLevel" NOT NULL,
    "message" TEXT NOT NULL,
    "args" JSONB,
    "stack" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "console_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_request_entries" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "requestId" TEXT,
    "method" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "requestHeaders" JSONB,
    "responseHeaders" JSONB,
    "requestBody" TEXT,
    "responseBody" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_request_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "projects_workspaceId_status_idx" ON "projects"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspaceId_key_key" ON "projects"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_workspaceId_status_idx" ON "users"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bug_reports_shareToken_key" ON "bug_reports"("shareToken");

-- CreateIndex
CREATE INDEX "bug_reports_workspaceId_projectId_status_createdAt_idx" ON "bug_reports"("workspaceId", "projectId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "bug_reports_shareToken_idx" ON "bug_reports"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "report_uploads_objectKey_key" ON "report_uploads"("objectKey");

-- CreateIndex
CREATE INDEX "report_uploads_reportId_kind_status_idx" ON "report_uploads"("reportId", "kind", "status");

-- CreateIndex
CREATE INDEX "report_events_reportId_kind_createdAt_idx" ON "report_events"("reportId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "console_log_entries_reportId_level_timestamp_idx" ON "console_log_entries"("reportId", "level", "timestamp");

-- CreateIndex
CREATE INDEX "network_request_entries_reportId_method_statusCode_startedA_idx" ON "network_request_entries"("reportId", "method", "statusCode", "startedAt");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_uploads" ADD CONSTRAINT "report_uploads_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_events" ADD CONSTRAINT "report_events_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "console_log_entries" ADD CONSTRAINT "console_log_entries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_request_entries" ADD CONSTRAINT "network_request_entries_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "bug_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
