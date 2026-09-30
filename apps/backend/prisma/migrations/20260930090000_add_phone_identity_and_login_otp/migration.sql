ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'LOGIN';
ALTER TYPE "OtpPurpose" ADD VALUE IF NOT EXISTS 'PHONE_VERIFICATION';

ALTER TABLE "users"
    ADD COLUMN "phoneNumber" TEXT,
    ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_phoneNumber_key" ON "users"("phoneNumber");

-- Existing password/Google accounts already passed the previous auth flow.
UPDATE "users"
SET "emailVerified" = "createdAt"
WHERE "emailVerified" IS NULL;
