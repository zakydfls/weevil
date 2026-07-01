-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP');

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "recipient" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "payload" JSONB,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "nextResendAt" TIMESTAMP(3) NOT NULL,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "consumedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "otp_challenges_purpose_recipient_key" ON "otp_challenges"("purpose", "recipient");

-- CreateIndex
CREATE INDEX "otp_challenges_purpose_expiresAt_idx" ON "otp_challenges"("purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "otp_challenges_consumedAt_idx" ON "otp_challenges"("consumedAt");
