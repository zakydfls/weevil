/**
 * Weevil seed data — two tenants with mixed roles, captures, and projects.
 *
 * Run with:  pnpm --filter @weevil/backend prisma:seed
 *
 * IDEMPOTENT: re-running upserts users / workspaces and adds captures
 * only when none exist for that workspace. Safe to run repeatedly.
 */
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Load env BEFORE the Prisma client picks up DATABASE_URL.
// Cascading search: apps/backend/.env (where this file lives) → repo root.
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
  PageActionKind,
  PlatformRole,
  ReportSource,
  ReportStatus,
  WorkspaceRole,
} from '../libs/database/src/generated/prisma/enums';

// Emails promoted to PLATFORM_ADMIN (cross-tenant operators).
const PLATFORM_ADMIN_EMAILS = new Set(['zaky@triquetra.cc']);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error(
    '❌ DATABASE_URL is not set. Add it to apps/backend/.env or export it before running the seeder.',
  );
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

// Identical password for every seeded user. Change before running in any shared env.
const SEED_PASSWORD = 'weevil1234';

async function passwordHash(plain: string) {
  return hash(plain, { type: argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
}

interface SeedUser {
  email: string;
  displayName: string;
  role: WorkspaceRole;
}

interface SeedWorkspace {
  slug: string;
  name: string;
  projectKey: string;
  projectName: string;
  users: SeedUser[];
}

const WORKSPACES: SeedWorkspace[] = [
  {
    slug: 'triquetra',
    name: 'Triquetra',
    projectKey: 'SIMPP',
    projectName: 'SIMPP PUSMANPRO',
    users: [
      { email: 'zaky@triquetra.cc', displayName: 'Zaky Daffa', role: WorkspaceRole.OWNER },
      { email: 'pm@triquetra.cc', displayName: 'Putri Maharani', role: WorkspaceRole.ADMIN },
      { email: 'qa@triquetra.cc', displayName: 'Qadir Aulia', role: WorkspaceRole.MEMBER },
      { email: 'dev@triquetra.cc', displayName: 'Dimas Eka', role: WorkspaceRole.MEMBER },
      { email: 'viewer@triquetra.cc', displayName: 'Vio Wirawan', role: WorkspaceRole.VIEWER },
    ],
  },
  {
    slug: 'acme-labs',
    name: 'Acme Labs',
    projectKey: 'APP',
    projectName: 'Acme Web App',
    users: [
      { email: 'founder@acme.test', displayName: 'Avery Founder', role: WorkspaceRole.OWNER },
      { email: 'lead@acme.test', displayName: 'Lia Engineer', role: WorkspaceRole.ADMIN },
      { email: 'qa@acme.test', displayName: 'Quinn QA', role: WorkspaceRole.MEMBER },
    ],
  },
];

const SAMPLE_TITLES = [
  'Checkout button stuck after 2nd click',
  'Date picker resets when I scroll the form',
  'Sidebar collapses when DevTools opens',
  'Search returns no results for known order',
  'Notification toast overlaps the modal',
  'Upload preview shows wrong filename',
  'Login form rejects valid email with trailing space',
  'PDF preview fails on Safari only',
  'Toggle stays on after I disable a row',
  'Calendar shows wrong month on small screens',
];

const STATUSES: ReportStatus[] = [
  ReportStatus.READY,
  ReportStatus.READY,
  ReportStatus.READY,
  ReportStatus.PROCESSING,
  ReportStatus.UPLOADING,
  ReportStatus.DRAFT,
];

async function main() {
  console.log('🌱 Seeding Weevil…');
  const hashed = await passwordHash(SEED_PASSWORD);

  for (const ws of WORKSPACES) {
    console.log(`\n📦 Workspace: ${ws.name} (${ws.slug})`);

    const workspace = await prisma.workspace.upsert({
      where: { slug: ws.slug },
      create: { slug: ws.slug, name: ws.name },
      update: { name: ws.name },
    });

    const project = await prisma.project.upsert({
      where: { workspaceId_key: { workspaceId: workspace.id, key: ws.projectKey } },
      create: {
        workspaceId: workspace.id,
        key: ws.projectKey,
        name: ws.projectName,
      },
      update: { name: ws.projectName },
    });

    for (const seedUser of ws.users) {
      const platformRole = PLATFORM_ADMIN_EMAILS.has(seedUser.email)
        ? PlatformRole.PLATFORM_ADMIN
        : PlatformRole.USER;

      const user = await prisma.user.upsert({
        where: { email: seedUser.email },
        create: {
          email: seedUser.email,
          emailVerified: new Date(),
          displayName: seedUser.displayName,
          passwordHash: hashed,
          defaultWorkspaceId: workspace.id,
          platformRole,
        },
        update: {
          passwordHash: hashed,
          emailVerified: new Date(),
          displayName: seedUser.displayName,
          defaultWorkspaceId: workspace.id,
          platformRole,
        },
      });

      await prisma.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: workspace.id,
            userId: user.id,
          },
        },
        create: {
          workspaceId: workspace.id,
          userId: user.id,
          role: seedUser.role,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
        update: {
          role: seedUser.role,
          status: MembershipStatus.ACTIVE,
        },
      });

      console.log(`  👤 ${seedUser.email.padEnd(28)} ${seedUser.role}`);
    }

    // Sample reports
    const existing = await prisma.bugReport.count({ where: { workspaceId: workspace.id } });
    if (existing > 0) {
      console.log(`  ✓ ${existing} existing captures (skipping sample seed)`);
      continue;
    }

    const owner = await prisma.user.findUnique({ where: { email: ws.users[0].email } });
    const creators = await prisma.user.findMany({
      where: { email: { in: ws.users.slice(0, 3).map((u) => u.email) } },
    });

    const now = Date.now();
    for (let i = 0; i < SAMPLE_TITLES.length; i++) {
      const title = SAMPLE_TITLES[i];
      const status = STATUSES[i % STATUSES.length];
      const createdBy = creators[i % creators.length] ?? owner;
      const createdAt = new Date(now - i * 1_000 * 60 * 90);
      const report = await prisma.bugReport.create({
        data: {
          workspaceId: workspace.id,
          projectId: project.id,
          createdById: createdBy?.id ?? null,
          title,
          description:
            i % 3 === 0
              ? 'User reported this from production. Steps: open the page, click the button, wait for the spinner — nothing happens.'
              : null,
          status,
          source: ReportSource.EXTENSION,
          shareToken: `seed-${ws.slug}-${i}-${Math.random().toString(36).slice(2, 10)}`,
          pageUrl: `https://${ws.slug}.example.com/app/feature-${i + 1}`,
          browserName: 'Chrome',
          browserVersion: '131.0.0.0',
          osName: 'macOS 14.5',
          viewportWidth: 1440,
          viewportHeight: 900,
          createdAt,
          updatedAt: createdAt,
        },
      });

      // Sprinkle a few console logs + a network request per report (so detail view has data)
      await prisma.consoleLogEntry.createMany({
        data: Array.from({ length: 3 + (i % 4) }, (_, idx) => ({
          reportId: report.id,
          level: idx === 0 ? 'ERROR' : idx === 1 ? 'WARN' : 'INFO',
          message:
            idx === 0
              ? "TypeError: Cannot read properties of undefined (reading 'id')"
              : idx === 1
                ? 'Deprecation: Synchronous XHR in page dismissal is deprecated.'
                : `Component mounted in ${(Math.random() * 100).toFixed(1)}ms`,
          timestamp: new Date(createdAt.getTime() + idx * 500),
          offsetMs: idx * 500,
          pageUrl: `https://${ws.slug}.example.com/app/feature-${i + 1}`,
        })),
      });

      await prisma.networkRequestEntry.createMany({
        data: Array.from({ length: 2 + (i % 3) }, (_, idx) => ({
          reportId: report.id,
          method: idx % 2 === 0 ? 'GET' : 'POST',
          url: `https://${ws.slug}.example.com/api/v1/${['users', 'orders', 'invoices', 'reports'][idx % 4]}`,
          statusCode: idx === 0 && i % 4 === 0 ? 500 : 200,
          durationMs: 50 + idx * 30,
          startedAt: new Date(createdAt.getTime() + idx * 350),
          endedAt: new Date(createdAt.getTime() + idx * 350 + 60),
          offsetMs: idx * 350,
        })),
      });

      await prisma.pageActionEntry.createMany({
        data: Array.from({ length: 4 }, (_, idx) => ({
          reportId: report.id,
          kind:
            idx === 0
              ? PageActionKind.NAVIGATION
              : idx === 1
                ? PageActionKind.CLICK
                : idx === 2
                  ? PageActionKind.INPUT
                  : PageActionKind.SCROLL,
          selector: idx === 1 ? 'button.primary[data-action="submit"]' : null,
          textPreview: idx === 1 ? 'Submit' : null,
          tagName: idx === 1 ? 'button' : null,
          pageUrl: `https://${ws.slug}.example.com/app/feature-${i + 1}`,
          occurredAt: new Date(createdAt.getTime() + idx * 800),
          offsetMs: idx * 800,
        })),
      });
    }

    console.log(`  ✓ Seeded ${SAMPLE_TITLES.length} captures with telemetry`);
  }

  console.log(`\n✅ Seed complete. Password for every seeded user: ${SEED_PASSWORD}`);
  console.log(
    `   Platform admin: ${Array.from(PLATFORM_ADMIN_EMAILS).join(', ')} — log in to see /platform dashboard.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
