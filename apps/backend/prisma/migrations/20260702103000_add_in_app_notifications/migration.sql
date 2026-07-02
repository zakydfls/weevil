CREATE TABLE "in_app_notifications" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "actionUrl" TEXT,
    "metadata" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "in_app_notifications_userId_readAt_createdAt_idx"
    ON "in_app_notifications"("userId", "readAt", "createdAt");

CREATE INDEX "in_app_notifications_workspaceId_createdAt_idx"
    ON "in_app_notifications"("workspaceId", "createdAt");

ALTER TABLE "in_app_notifications"
    ADD CONSTRAINT "in_app_notifications_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "in_app_notifications"
    ADD CONSTRAINT "in_app_notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
