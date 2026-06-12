-- AlterTable
ALTER TABLE "api_tokens" ALTER COLUMN "permissions" DROP DEFAULT;

-- AlterTable
ALTER TABLE "workspace_members" ALTER COLUMN "extraPermissions" DROP DEFAULT,
ALTER COLUMN "deniedPermissions" DROP DEFAULT;
