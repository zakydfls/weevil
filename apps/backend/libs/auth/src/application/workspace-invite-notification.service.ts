import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';
import {
  MailerService,
  renderWorkspaceInviteEmail,
  workspaceInviteEmailSubject,
} from '@weevil/notifications';
import type { WorkspaceRole } from '@weevil/prisma-client';

interface WorkspaceInviteNotificationInput {
  invitedEmail: string;
  inviteToken: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
  inviter: {
    email: string;
    displayName: string | null;
  } | null;
  expiresAt: Date;
}

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

  async sendInvite(
    input: WorkspaceInviteNotificationInput,
  ): Promise<WorkspaceInviteNotificationResult> {
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
