import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppConfigService } from '@weevil/config';
// Event contract comes from @weevil/contracts — importing the
// @weevil/in-app-notifications barrel here creates a circular require
// (auth → in-app-notifications → controller → auth) that breaks decorators
// at runtime in production.
import { InAppNotificationEvents } from '@weevil/contracts';
import { PrismaService } from '@weevil/database';
import {
  MailerService,
  renderWorkspaceJoinApprovedEmail,
  renderWorkspaceJoinRequestEmail,
  workspaceJoinApprovedEmailSubject,
  workspaceJoinRequestEmailSubject,
} from '@weevil/notifications';
import { MembershipStatus, UserStatus, WorkspaceRole } from '@weevil/prisma-client';
import {
  WorkspaceEvents,
  type WorkspaceJoinApprovedEvent,
  type WorkspaceJoinRequestedEvent,
} from '../domain/workspace-events';

@Injectable()
export class WorkspaceJoinRequestNotificationService {
  private readonly logger = new Logger(WorkspaceJoinRequestNotificationService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent(WorkspaceEvents.JoinRequested, { suppressErrors: true })
  async handleJoinRequested(event: WorkspaceJoinRequestedEvent): Promise<void> {
    try {
      await this.notifyReviewers(event);
    } catch (error) {
      this.logger.warn(
        `Join request notification failed for ${event.requesterEmail}: ${errorMessage(error)}`,
      );
    }
  }

  @OnEvent(WorkspaceEvents.JoinApproved, { suppressErrors: true })
  async handleJoinApproved(event: WorkspaceJoinApprovedEvent): Promise<void> {
    try {
      await this.notifyRequester(event);
    } catch (error) {
      this.logger.warn(
        `Join approval notification failed for ${event.requesterEmail}: ${errorMessage(error)}`,
      );
    }
  }

  private async notifyReviewers(event: WorkspaceJoinRequestedEvent): Promise<void> {
    const reviewers = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId: event.workspaceId,
        status: MembershipStatus.ACTIVE,
        role: { in: [WorkspaceRole.OWNER, WorkspaceRole.ADMIN] },
        user: { status: UserStatus.ACTIVE },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            displayName: true,
          },
        },
      },
    });
    if (reviewers.length === 0) return;

    this.eventEmitter.emit(InAppNotificationEvents.Requested, {
      notifications: reviewers.map(({ user }) => ({
        userId: user.id,
        workspaceId: event.workspaceId,
        type: 'workspace_join_requested',
        title: 'Workspace access request',
        body: `${event.requesterName ?? event.requesterEmail} requested access to ${event.workspaceName}.`,
        actionUrl: '/settings',
        metadata: {
          workspace_slug: event.workspaceSlug,
          member_id: event.memberId,
          requester_email: event.requesterEmail,
        },
      })),
    });

    const reviewUrl = this.buildSettingsUrl();
    if (!isAbsoluteHttpUrl(reviewUrl)) {
      this.logger.warn('WEB_APP_URL is not configured; workspace join request email skipped.');
      return;
    }

    const html = renderWorkspaceJoinRequestEmail({
      requesterEmail: event.requesterEmail,
      requesterName: event.requesterName,
      workspaceName: event.workspaceName,
      workspaceSlug: event.workspaceSlug,
      reviewUrl,
    });

    const results = await Promise.allSettled(
      reviewers.map(({ user }) =>
        this.mailer.send({
          to: user.email,
          subject: workspaceJoinRequestEmailSubject({ workspaceName: event.workspaceName }),
          html,
          metadata: {
            notification_type: 'workspace_join_requested',
            workspace_id: event.workspaceId,
            member_id: event.memberId,
            requester_email: event.requesterEmail,
            recipient_user_id: user.id,
            recipient_display_name: user.displayName,
          },
        }),
      ),
    );

    const failed = results.filter(
      (result) =>
        result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.sent),
    ).length;
    if (failed > 0) {
      this.logger.warn(
        `Join request notification delivery had ${failed}/${reviewers.length} failures.`,
      );
    }
  }

  private async notifyRequester(event: WorkspaceJoinApprovedEvent): Promise<void> {
    this.eventEmitter.emit(InAppNotificationEvents.Requested, {
      notifications: [
        {
          userId: event.requesterUserId,
          workspaceId: event.workspaceId,
          type: 'workspace_join_approved',
          title: 'Workspace access approved',
          body: `You can now open ${event.workspaceName}.`,
          actionUrl: '/captures',
          metadata: {
            workspace_slug: event.workspaceSlug,
          },
        },
      ],
    });

    const loginUrl = this.buildLoginUrl();
    if (!isAbsoluteHttpUrl(loginUrl)) {
      this.logger.warn('WEB_APP_URL is not configured; workspace join approval email skipped.');
      return;
    }

    await this.mailer.send({
      to: event.requesterEmail,
      subject: workspaceJoinApprovedEmailSubject({ workspaceName: event.workspaceName }),
      html: renderWorkspaceJoinApprovedEmail({
        requesterName: event.requesterName,
        workspaceName: event.workspaceName,
        workspaceSlug: event.workspaceSlug,
        loginUrl,
      }),
      metadata: {
        notification_type: 'workspace_join_approved',
        workspace_slug: event.workspaceSlug,
      },
    });
  }

  private buildSettingsUrl(): string {
    const baseUrl = this.webBaseUrl();
    if (!baseUrl) return '/settings';
    return new URL('/settings', `${baseUrl}/`).toString();
  }

  private buildLoginUrl(): string {
    const baseUrl = this.webBaseUrl();
    if (!baseUrl) return '/login';
    return new URL('/login', `${baseUrl}/`).toString();
  }

  private webBaseUrl(): string | null {
    return (
      normalizeAbsoluteBaseUrl(this.config.webAppUrl) ??
      normalizeAbsoluteBaseUrl(this.config.webOrigins[0]) ??
      (this.config.nodeEnv === 'production' ? null : 'http://localhost:3000')
    );
  }
}

function normalizeAbsoluteBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${isLocalHost(trimmed) ? 'http' : 'https'}://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isLocalHost(value: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value);
}

function isAbsoluteHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
