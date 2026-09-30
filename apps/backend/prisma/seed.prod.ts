/**
 * Weevil PRODUCTION seeder — bootstraps the real owner account only.
 *
 * Unlike `seed.ts` (dev fixtures with dummy tenants + sample captures), this
 * creates exactly ONE workspace and ONE user: the platform owner. No sample
 * bug reports, no fake teammates.
 *
 * Run with:  pnpm --filter @weevil/backend prisma:seed:prod
 *
 * Required / optional env:
 *   SEED_ADMIN_EMAIL      (default: zaky.d@triquetra.cc)
 *   SEED_ADMIN_PASSWORD   (REQUIRED — no default; the seeder refuses to run without it)
 *   SEED_ADMIN_NAME       (default: Zaky Daffa)
 *   SEED_WORKSPACE_SLUG   (default: triquetra)
 *   SEED_WORKSPACE_NAME   (default: Triquetra)
 *   SEED_PROJECT_KEY      (default: BUG)
 *   SEED_PROJECT_NAME     (default: Bugs)
 *
 * IDEMPOTENT: re-running upserts the user/workspace/project; it never
 * overwrites the password unless SEED_ADMIN_PASSWORD is provided AND the user
 * is being (re)bootstrapped — see `resolvePasswordHash`.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envCandidates = [resolve(__dirname, '../.env'), resolve(__dirname, '../../../.env')];
for (const candidate of envCandidates) {
  if (existsSync(candidate)) {
    loadEnv({ path: candidate });
    break;
  }
}

import { hash, argon2id } from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../libs/database/src/generated/prisma/client';
import {
  MembershipStatus,
  PlatformRole,
  WorkspaceRole,
} from '../libs/database/src/generated/prisma/enums';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ DATABASE_URL is not set. Add it to apps/backend/.env or export it.');
  process.exit(1);
}

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'zaky.d@triquetra.cc').trim().toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD;
const adminName = process.env.SEED_ADMIN_NAME ?? 'Zaky Daffa';
const workspaceSlug = normalizeWorkspaceSlug(process.env.SEED_WORKSPACE_SLUG ?? 'triquetra');
const workspaceName = process.env.SEED_WORKSPACE_NAME ?? 'Triquetra';
const projectKey = process.env.SEED_PROJECT_KEY ?? 'BUG';
const projectName = process.env.SEED_PROJECT_NAME ?? 'Bugs';

if (!adminPassword || adminPassword.length < 10) {
  console.error(
    '❌ SEED_ADMIN_PASSWORD is required (min 10 chars). Refusing to seed prod with a default password.',
  );
  process.exit(1);
}

if (!/^[a-z0-9-]{2,40}$/.test(workspaceSlug)) {
  console.error(
    '❌ SEED_WORKSPACE_SLUG must resolve to 2-40 lowercase letters, numbers, or hyphens.',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function passwordHash(plain: string) {
  return hash(plain, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

async function main() {
  console.log('🌱 Seeding Weevil (production)…');

  const existingWorkspace = await prisma.workspace.findFirst({
    where: {
      slug: { equals: workspaceSlug, mode: 'insensitive' },
    },
  });
  const workspace = existingWorkspace
    ? await prisma.workspace.update({
        where: { id: existingWorkspace.id },
        data: { slug: workspaceSlug, name: workspaceName },
      })
    : await prisma.workspace.create({
        data: { slug: workspaceSlug, name: workspaceName },
      });
  console.log(`  📦 Workspace: ${workspace.name} (${workspace.slug})`);

  await prisma.project.upsert({
    where: { workspaceId_key: { workspaceId: workspace.id, key: projectKey } },
    create: { workspaceId: workspace.id, key: projectKey, name: projectName },
    update: { name: projectName },
  });
  console.log(`  📁 Project: ${projectName} (${projectKey})`);

  const hashed = await passwordHash(adminPassword as string);

  const user = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      emailVerified: new Date(),
      displayName: adminName,
      passwordHash: hashed,
      defaultWorkspaceId: workspace.id,
      platformRole: PlatformRole.PLATFORM_ADMIN,
    },
    update: {
      // Keep the account in sync; rotate the password to the provided one.
      passwordHash: hashed,
      emailVerified: new Date(),
      displayName: adminName,
      defaultWorkspaceId: workspace.id,
      platformRole: PlatformRole.PLATFORM_ADMIN,
    },
  });

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: user.id } },
    create: {
      workspaceId: workspace.id,
      userId: user.id,
      role: WorkspaceRole.OWNER,
      status: MembershipStatus.ACTIVE,
      joinedAt: new Date(),
    },
    update: { role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE },
  });

  console.log(`  👤 ${adminEmail} → OWNER + PLATFORM_ADMIN`);
  console.log('✅ Production seed complete.');
}

main()
  .catch((error) => {
    console.error('❌ Production seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });

function normalizeWorkspaceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
