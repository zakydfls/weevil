import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@weevil/database';
import {
  MembershipStatus,
  Permission,
  UserStatus,
  WorkspaceRole,
  WorkspaceStatus,
} from '@weevil/prisma-client';
import { resolveEffectivePermissions } from '../domain/permissions';
import {
  WorkspaceEvents,
  type WorkspaceInviteCreatedEvent,
  type WorkspaceJoinApprovedEvent,
} from '../domain/workspace-events';
import { PermissionService } from './permission.service';
import { TokenService } from './token.service';
import { WorkspaceInviteNotificationService } from './workspace-invite-notification.service';

interface WorkspaceNotificationPreferencesInput {
  emailOnNewCapture?: boolean;
  emailOnNewComment?: boolean;
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly permissionService: PermissionService,
    private readonly tokenService: TokenService,
    private readonly workspaceInviteNotification: WorkspaceInviteNotificationService,
  ) {}

  /** All workspaces the user is an active member of. */
  async listMine(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId, status: MembershipStatus.ACTIVE },
      include: { workspace: true },
      orderBy: { workspace: { name: 'asc' } },
    });
    return memberships.map((m) => ({
      id: m.workspace.id,
      slug: m.workspace.slug,
      name: m.workspace.name,
      role: m.role,
      status: m.workspace.status,
      joinedAt: m.joinedAt?.toISOString() ?? null,
    }));
  }

  /** Create a brand-new workspace; caller becomes OWNER. */
  async create(userId: string, name: string, slug: string, sessionId?: string) {
    const cleanSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(cleanSlug)) {
      throw new BadRequestException('Slug must be 2-40 lowercase letters, numbers, or hyphens.');
    }
    const existing = await this.prisma.workspace.findUnique({ where: { slug: cleanSlug } });
    if (existing) throw new ConflictException('That slug is already taken.');

    return this.prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          slug: cleanSlug,
          name,
          status: WorkspaceStatus.ACTIVE,
          projects: { create: { key: 'DEFAULT', name: `${name} (default)` } },
        },
      });
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId,
          role: WorkspaceRole.OWNER,
          status: MembershipStatus.ACTIVE,
          joinedAt: new Date(),
        },
      });
      await tx.user.update({ where: { id: userId }, data: { defaultWorkspaceId: workspace.id } });
      if (sessionId) {
        await tx.authSession.update({
          where: { id: sessionId },
          data: { workspaceId: workspace.id },
        });
      }
      return workspace;
    });
  }

  async switchActiveWorkspace(userId: string, sessionId: string, slug: string) {
    const cleanSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]{2,40}$/.test(cleanSlug)) {
      throw new BadRequestException('Slug must be 2-40 lowercase letters, numbers, or hyphens.');
    }

    const workspace = await this.prisma.workspace.findUnique({ where: { slug: cleanSlug } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found.');
    }

    const workspaceContext = await this.permissionService.loadWorkspaceContext(userId, workspace.id);
    if (!workspaceContext) {
      throw new ForbiddenException('You are not a member of this workspace.');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { defaultWorkspaceId: workspace.id },
      }),
      this.prisma.authSession.update({
        where: { id: sessionId },
        data: { workspaceId: workspace.id },
      }),
    ]);

    return {
      id: workspaceContext.id,
      slug: workspaceContext.slug,
      role: workspaceContext.role,
      permissions: Array.from(workspaceContext.permissions),
    };
  }

  async listMembers(workspaceId: string) {
    const [members, pendingInvites] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId, status: { not: MembershipStatus.REVOKED } },
        include: { user: true },
        orderBy: [{ role: 'asc' }, { user: { displayName: 'asc' } }],
      }),
      this.prisma.workspaceInvite.findMany({
        where: {
          workspaceId,
          status: MembershipStatus.INVITED,
          expiresAt: { gte: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const memberRows = members.map((m) => ({
      id: m.id,
      userId: m.user.id,
      email: m.user.email,
      displayName: m.user.displayName,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      status: m.status,
      extraPermissions: m.extraPermissions,
      deniedPermissions: m.deniedPermissions,
      effectivePermissions: Array.from(
        resolveEffectivePermissions(m.role, m.extraPermissions, m.deniedPermissions),
      ),
      joinedAt: m.joinedAt?.toISOString() ?? null,
      lastActiveAt: m.lastActiveAt?.toISOString() ?? null,
      requestKind:
        m.status === MembershipStatus.INVITED && !m.invitedById ? 'JOIN_REQUEST' : 'MEMBER',
    }));
    const pendingRows = pendingInvites.map((invite) => ({
      id: invite.id,
      userId: null,
      email: invite.email,
      displayName: null,
      avatarUrl: null,
      role: invite.role,
      status: invite.status,
      extraPermissions: [],
      deniedPermissions: [],
      effectivePermissions: Array.from(resolveEffectivePermissions(invite.role, [], [])),
      joinedAt: null,
      lastActiveAt: null,
      expiresAt: invite.expiresAt.toISOString(),
      inviteUrl: this.workspaceInviteNotification.buildInviteUrl(invite.token),
      requestKind: 'INVITE',
    }));

    return [...memberRows, ...pendingRows];
  }

  async getNotificationPreferences(workspaceId: string, userId: string) {
    await this.assertActiveMembership(workspaceId, userId);

    const preferences = await this.prisma.userNotificationPreference.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });

    return {
      emailOnNewCapture: preferences?.emailOnNewCapture ?? false,
      emailOnNewComment: preferences?.emailOnNewComment ?? false,
    };
  }

  async updateNotificationPreferences(
    workspaceId: string,
    userId: string,
    input: WorkspaceNotificationPreferencesInput,
  ) {
    await this.assertActiveMembership(workspaceId, userId);

    const preferences = await this.prisma.userNotificationPreference.upsert({
      where: { workspaceId_userId: { workspaceId, userId } },
      create: {
        workspaceId,
        userId,
        emailOnNewCapture: input.emailOnNewCapture ?? false,
        emailOnNewComment: input.emailOnNewComment ?? false,
      },
      update: compactBooleanUpdate({
        emailOnNewCapture: input.emailOnNewCapture,
        emailOnNewComment: input.emailOnNewComment,
      }),
    });

    return {
      emailOnNewCapture: preferences.emailOnNewCapture,
      emailOnNewComment: preferences.emailOnNewComment,
    };
  }

  async invite(workspaceId: string, invitedById: string, email: string, role: WorkspaceRole) {
    const cleanEmail = email.trim().toLowerCase();
    const ttl = 7 * 24 * 60 * 60 * 1_000;
    const [workspace, inviter] = await Promise.all([
      this.prisma.workspace.findUnique({ where: { id: workspaceId } }),
      this.prisma.user.findUnique({
        where: { id: invitedById },
        select: { email: true, displayName: true },
      }),
    ]);
    if (!workspace) throw new NotFoundException('Workspace not found.');

    // Reject if already a member
    const existingUser = await this.prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existingUser) {
      const existingMember = await this.prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: existingUser.id } },
      });
      if (existingMember) {
        throw new ConflictException('User is already a member of this workspace.');
      }
    }

    const { hash } = this.tokenService.generate('tok');
    const invite = await this.prisma.workspaceInvite.upsert({
      where: { workspaceId_email: { workspaceId, email: cleanEmail } },
      create: {
        workspaceId,
        email: cleanEmail,
        role,
        token: hash,
        createdById: invitedById,
        expiresAt: new Date(Date.now() + ttl),
      },
      update: {
        role,
        status: MembershipStatus.INVITED,
        token: hash,
        expiresAt: new Date(Date.now() + ttl),
        acceptedAt: null,
      },
    });
    this.eventEmitter.emit(WorkspaceEvents.InviteCreated, {
      invitedEmail: invite.email,
      inviteToken: invite.token,
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      role: invite.role,
      inviter,
      expiresAt: invite.expiresAt,
    } satisfies WorkspaceInviteCreatedEvent);

    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      inviteUrl: this.workspaceInviteNotification.buildInviteUrl(invite.token),
      emailSent: false,
      notificationId: null,
      token: invite.token,
    };
  }

  async changeRole(workspaceId: string, memberId: string, role: WorkspaceRole) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found.');
    }
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });
  }

  async setPermissionOverrides(
    workspaceId: string,
    memberId: string,
    extraPermissions: Permission[],
    deniedPermissions: Permission[],
  ) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found.');
    }
    return this.prisma.workspaceMember.update({
      where: { id: memberId },
      data: { extraPermissions, deniedPermissions },
    });
  }

  async approveJoinRequest(workspaceId: string, memberId: string, actingUserId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: true, workspace: true },
    });
    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Join request not found.');
    }
    if (
      member.status !== MembershipStatus.INVITED ||
      member.invitedById ||
      member.user.status !== UserStatus.INVITED
    ) {
      throw new BadRequestException('This member is not waiting for workspace approval.');
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: member.userId },
        data: {
          status: UserStatus.ACTIVE,
          defaultWorkspaceId: member.workspaceId,
        },
      }),
      this.prisma.workspaceMember.update({
        where: { id: member.id },
        data: {
          status: MembershipStatus.ACTIVE,
          invitedById: actingUserId,
          joinedAt: new Date(),
        },
      }),
    ]);

    this.eventEmitter.emit(WorkspaceEvents.JoinApproved, {
      workspaceId: member.workspaceId,
      workspaceName: member.workspace.name,
      workspaceSlug: member.workspace.slug,
      requesterUserId: member.userId,
      requesterEmail: member.user.email,
      requesterName: member.user.displayName,
    } satisfies WorkspaceJoinApprovedEvent);

    return {
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      displayName: member.user.displayName,
      avatarUrl: member.user.avatarUrl,
      role: member.role,
      status: MembershipStatus.ACTIVE,
      requestKind: 'MEMBER',
    };
  }

  async rejectJoinRequest(workspaceId: string, memberId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: { user: true },
    });
    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Join request not found.');
    }
    if (
      member.status !== MembershipStatus.INVITED ||
      member.invitedById ||
      member.user.status !== UserStatus.INVITED
    ) {
      throw new BadRequestException('This member is not waiting for workspace approval.');
    }

    await this.prisma.$transaction([
      this.prisma.workspaceMember.delete({ where: { id: member.id } }),
      this.prisma.user.delete({ where: { id: member.userId } }),
    ]);
  }

  async removeMember(workspaceId: string, memberId: string, actingUserId: string) {
    const member = await this.prisma.workspaceMember.findUnique({ where: { id: memberId } });
    if (!member || member.workspaceId !== workspaceId) {
      throw new NotFoundException('Member not found.');
    }
    // Prevent removing the last OWNER
    if (member.role === WorkspaceRole.OWNER) {
      const ownerCount = await this.prisma.workspaceMember.count({
        where: { workspaceId, role: WorkspaceRole.OWNER, status: MembershipStatus.ACTIVE },
      });
      if (ownerCount <= 1) {
        throw new ForbiddenException('Cannot remove the last owner. Promote someone else first.');
      }
    }
    await this.prisma.workspaceMember.delete({ where: { id: memberId } });
    if (member.userId === actingUserId) {
      // Reset their default workspace
      await this.prisma.user.update({
        where: { id: actingUserId },
        data: { defaultWorkspaceId: null },
      });
    }
  }

  private async assertActiveMembership(workspaceId: string, userId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { status: true },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('No active membership for this workspace.');
    }
  }
}

function compactBooleanUpdate(input: WorkspaceNotificationPreferencesInput) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => typeof value === 'boolean'),
  );
}
