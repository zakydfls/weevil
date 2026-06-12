-- Auth + multi-tenant RBAC scaffolding.
-- Run `pnpm prisma:migrate dev` to apply (or `prisma migrate deploy` in production).
-- This file is a hand-authored stub; if `prisma migrate dev` generates a competing one,
-- delete this directory and use the generated one — they should produce the same schema.

-- ─── New enums ────────────────────────────────────────────────────────────────

CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "PlatformRole" AS ENUM ('USER', 'SUPPORT', 'PLATFORM_ADMIN');
CREATE TYPE "Permission" AS ENUM (
  'WORKSPACE_VIEW', 'WORKSPACE_UPDATE', 'WORKSPACE_DELETE', 'WORKSPACE_BILLING',
  'MEMBER_INVITE', 'MEMBER_REMOVE', 'MEMBER_ROLE_UPDATE',
  'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE',
  'REPORT_CREATE', 'REPORT_READ_ALL', 'REPORT_READ_OWN',
  'REPORT_UPDATE_ANY', 'REPORT_UPDATE_OWN', 'REPORT_DELETE_ANY', 'REPORT_DELETE_OWN', 'REPORT_SHARE',
  'COMMENT_CREATE', 'COMMENT_DELETE_ANY', 'COMMENT_DELETE_OWN',
  'API_TOKEN_MANAGE', 'INTEGRATION_MANAGE', 'BOARD_MANAGE'
);

-- ─── User schema upgrade ──────────────────────────────────────────────────────

-- Drop the existing direct workspaceId FK on users (replaced by WorkspaceMember).
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_workspaceId_fkey";
DROP INDEX IF EXISTS "users_workspaceId_status_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "workspaceId";

-- New columns. NB: email must be present for login — if you have legacy null-email users,
-- backfill before applying the NOT NULL constraint.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "emailVerified" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT,
  ADD COLUMN IF NOT EXISTS "platformRole" "PlatformRole" NOT NULL DEFAULT 'USER',
  ADD COLUMN IF NOT EXISTS "defaultWorkspaceId" TEXT;

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_defaultWorkspaceId_fkey"
  FOREIGN KEY ("defaultWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "users"("status");

-- ─── WorkspaceMember (junction with role + permissions) ───────────────────────

CREATE TABLE "workspace_members" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
  "extraPermissions" "Permission"[] DEFAULT ARRAY[]::"Permission"[],
  "deniedPermissions" "Permission"[] DEFAULT ARRAY[]::"Permission"[],
  "invitedById" TEXT,
  "joinedAt" TIMESTAMP(3),
  "lastActiveAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "workspace_members_workspaceId_userId_key" ON "workspace_members"("workspaceId", "userId");
CREATE INDEX "workspace_members_userId_status_idx" ON "workspace_members"("userId", "status");
CREATE INDEX "workspace_members_workspaceId_role_status_idx" ON "workspace_members"("workspaceId", "role", "status");

-- ─── WorkspaceInvite ──────────────────────────────────────────────────────────

CREATE TABLE "workspace_invites" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
  "token" TEXT NOT NULL,
  "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
  "createdById" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "workspace_invites_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "workspace_invites_token_key" ON "workspace_invites"("token");
CREATE UNIQUE INDEX "workspace_invites_workspaceId_email_key" ON "workspace_invites"("workspaceId", "email");
CREATE INDEX "workspace_invites_token_idx" ON "workspace_invites"("token");

-- ─── AuthSession (opaque bearer tokens) ──────────────────────────────────────

CREATE TABLE "auth_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "workspaceId" TEXT,
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "auth_sessions_tokenHash_key" ON "auth_sessions"("tokenHash");
CREATE INDEX "auth_sessions_userId_expiresAt_idx" ON "auth_sessions"("userId", "expiresAt");

-- ─── ApiToken (programmatic access) ──────────────────────────────────────────

CREATE TABLE "api_tokens" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "permissions" "Permission"[] DEFAULT ARRAY[]::"Permission"[],
  "lastUsedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "api_tokens_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "api_tokens_tokenHash_key" ON "api_tokens"("tokenHash");
CREATE INDEX "api_tokens_workspaceId_revokedAt_idx" ON "api_tokens"("workspaceId", "revokedAt");
