CREATE TYPE "UserIdentityProvider" AS ENUM ('FIREBASE_GOOGLE');

CREATE TABLE "user_identities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "UserIdentityProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "emailAtLink" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_identities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_identities_provider_providerUserId_key" ON "user_identities"("provider", "providerUserId");
CREATE INDEX "user_identities_userId_idx" ON "user_identities"("userId");

ALTER TABLE "user_identities"
  ADD CONSTRAINT "user_identities_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
