import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppConfigService } from '@weevil/config';
import {
  MailerService,
  renderWorkspaceInviteEmail,
  workspaceInviteEmailSubject,
} from '@weevil/notifications';
import { WorkspaceEvents, type WorkspaceInviteCreatedEvent } from '../domain/workspace-events';

interface WorkspaceInviteNotificationResult {
  inviteUrl: string;
  sent: boolean;
  notificationId: string | null;
}

@Injectable()
export class WorkspaceInviteNotificationService {
  private readonly logger = new Logger(WorkspaceInviteNotificationService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly mailer: MailerService,
  ) {}

  @OnEvent(WorkspaceEvents.InviteCreated, { suppressErrors: true })
  async handleInviteCreated(event: WorkspaceInviteCreatedEvent): Promise<void> {
    try {
      await this.sendInvite(event);
    } catch (error) {
      this.logger.warn(
        `Workspace invite notification failed for ${event.invitedEmail}: ${errorMessage(error)}`,
      );
    }
  }

  async sendInvite(input: WorkspaceInviteCreatedEvent): Promise<WorkspaceInviteNotificationResult> {
    const inviteUrl = this.buildInviteUrl(input.inviteToken);

    if (!isAbsoluteHttpUrl(inviteUrl)) {
      this.logger.warn('WEB_APP_URL is not configured; workspace invite email skipped.');
      return { inviteUrl, sent: false, notificationId: null };
    }

    const inviterLabel = input.inviter?.displayName || input.inviter?.email || 'A teammate';
    const result = await this.mailer.send({
      to: input.invitedEmail,
      subject: workspaceInviteEmailSubject({ workspaceName: input.workspaceName }),
      html: renderWorkspaceInviteEmail({
        inviteUrl,
        inviterLabel,
        role: input.role,
        workspaceName: input.workspaceName,
        workspaceSlug: input.workspaceSlug,
        expiresAt: input.expiresAt,
      }),
    });

    return {
      inviteUrl,
      sent: result.sent,
      notificationId: result.notificationId,
    };
  }

  buildInviteUrl(inviteToken: string): string {
    const baseUrl = this.webBaseUrl();
    const query = `token=${encodeURIComponent(inviteToken)}`;
    if (!baseUrl) {
      return `/accept-invite?${query}`;
    }
    const url = new URL('/accept-invite', `${baseUrl}/`);
    url.searchParams.set('token', inviteToken);
    return url.toString();
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
