ALTER TABLE "user_notification_preferences"
    ADD COLUMN IF NOT EXISTS "emailOnAssignment" BOOLEAN NOT NULL DEFAULT false;
