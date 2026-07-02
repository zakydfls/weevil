CREATE TABLE "user_notification_preferences" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailOnNewCapture" BOOLEAN NOT NULL DEFAULT false,
    "emailOnNewComment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_notification_preferences_workspaceId_userId_key"
    ON "user_notification_preferences"("workspaceId", "userId");

CREATE INDEX "user_notification_preferences_userId_idx"
    ON "user_notification_preferences"("userId");

ALTER TABLE "user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notification_preferences"
    ADD CONSTRAINT "user_notification_preferences_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
