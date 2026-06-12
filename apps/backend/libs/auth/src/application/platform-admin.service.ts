import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@weevil/database';
import { MembershipStatus, PlatformRole, UserStatus, WorkspaceStatus } from '@weevil/prisma-client';

@Injectable()
export class PlatformAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** High-level platform stats. Aggregates done in SQL for speed at scale. */
  async overview() {
    const now = new Date();
    const last30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const prev30Start = new Date(last30.getTime() - 30 * 24 * 60 * 60 * 1_000);

    const [
      workspaceCount,
      activeWorkspaceCount,
      userCount,
      activeUserCount,
      reportCount,
      reportsLast30,
      reportsPrev30,
      sessionCount30,
      newWorkspaces30,
      newUsers30,
      capturesByDay,
    ] = await Promise.all([
      this.prisma.workspace.count(),
      this.prisma.workspace.count({ where: { status: WorkspaceStatus.ACTIVE } }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { status: UserStatus.ACTIVE } }),
      this.prisma.bugReport.count({ where: { deletedAt: null } }),
      this.prisma.bugReport.count({ where: { deletedAt: null, createdAt: { gte: last30 } } }),
      this.prisma.bugReport.count({
        where: { deletedAt: null, createdAt: { gte: prev30Start, lt: last30 } },
      }),
      this.prisma.authSession.count({
        where: { lastUsedAt: { gte: last30 }, revokedAt: null },
      }),
      this.prisma.workspace.count({ where: { createdAt: { gte: last30 } } }),
      this.prisma.user.count({ where: { createdAt: { gte: last30 } } }),
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS count
        FROM "bug_reports"
        WHERE "createdAt" >= ${last30} AND "deletedAt" IS NULL
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    const growthRatio =
      reportsPrev30 === 0
        ? null
        : Math.round(((reportsLast30 - reportsPrev30) / reportsPrev30) * 1000) / 10;

    return {
      generatedAt: now.toISOString(),
      counts: {
        workspaces: { total: workspaceCount, active: activeWorkspaceCount },
        users: { total: userCount, active: activeUserCount },
        reports: { total: reportCount, last30Days: reportsLast30, prev30Days: reportsPrev30 },
        activeSessionsLast30Days: sessionCount30,
      },
      growth: {
        newWorkspaces30: newWorkspaces30,
        newUsers30: newUsers30,
        reportGrowthPct: growthRatio,
      },
      timeline: {
        capturesByDay: capturesByDay.map((row) => ({
          day: row.day.toISOString(),
          count: Number(row.count),
        })),
      },
    };
  }

  /** List every workspace with member + report counts. */
  async listWorkspaces() {
    const workspaces = await this.prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { members: true, reports: true, projects: true },
        },
      },
    });
    return workspaces.map((w) => ({
      id: w.id,
      slug: w.slug,
      name: w.name,
      status: w.status,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
      memberCount: w._count.members,
      reportCount: w._count.reports,
      projectCount: w._count.projects,
    }));
  }

  async setWorkspaceStatus(workspaceId: string, status: WorkspaceStatus) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { status },
      select: { id: true, slug: true, name: true, status: true },
    });
  }

  /** List every user with their workspace memberships. */
  async listUsers(query: { search?: string; limit?: number } = {}) {
    const limit = Math.min(query.limit ?? 100, 500);
    const search = query.search?.trim();
    const users = await this.prisma.user.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { displayName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: { workspace: true },
        },
        _count: { select: { sessions: true } },
      },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      status: u.status,
      platformRole: u.platformRole,
      createdAt: u.createdAt.toISOString(),
      sessionCount: u._count.sessions,
      workspaces: u.memberships.map((m) => ({
        id: m.workspace.id,
        slug: m.workspace.slug,
        name: m.workspace.name,
        role: m.role,
      })),
    }));
  }

  async setUserStatus(userId: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found.');
    return this.prisma.user.update({
      where: { id: userId },
      data: { status },
      select: { id: true, email: true, status: true },
    });
  }

  async setPlatformRole(userId: string, role: PlatformRole, actingUserId: string) {
    if (userId === actingUserId && role !== PlatformRole.PLATFORM_ADMIN) {
      // Prevent the last admin from demoting themselves.
      const platformAdminCount = await this.prisma.user.count({
        where: { platformRole: PlatformRole.PLATFORM_ADMIN, status: UserStatus.ACTIVE },
      });
      if (platformAdminCount <= 1) {
        throw new ForbiddenException(
          'Cannot demote yourself — you are the last platform admin. Promote another user first.',
        );
      }
    }
    return this.prisma.user.update({
      where: { id: userId },
      data: { platformRole: role },
      select: { id: true, email: true, platformRole: true },
    });
  }

  /** Recent activity feed (cross-tenant). */
  async recentActivity(limit = 20) {
    const reports = await this.prisma.bugReport.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { workspace: true, createdBy: true },
    });
    return reports.map((r) => ({
      type: 'capture' as const,
      id: r.id,
      title: r.title,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      workspace: { id: r.workspace.id, slug: r.workspace.slug, name: r.workspace.name },
      createdBy: r.createdBy
        ? { email: r.createdBy.email, displayName: r.createdBy.displayName }
        : null,
    }));
  }
}
