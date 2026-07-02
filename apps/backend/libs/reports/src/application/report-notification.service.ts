import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AppConfigService } from '@weevil/config';
import { PrismaService } from '@weevil/database';
import {
  MailerService,
  newCaptureEmailSubject,
  renderNewCaptureEmail,
  renderReportCommentEmail,
  reportCommentEmailSubject,
  type ReportNotificationDetail,
} from '@weevil/notifications';
import { MembershipStatus, UserStatus } from '@weevil/prisma-client';
import {
  ReportEvents,
  type ReportCaptureReadyEvent,
  type ReportCommentCreatedEvent,
} from '../domain/report-events';

interface ReportNotificationRecipient {
  userId: string;
  email: string;
  displayName: string | null;
}

@Injectable()
export class ReportNotificationService {
  private readonly logger = new Logger(ReportNotificationService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  @OnEvent(ReportEvents.CommentCreated, { suppressErrors: true })
  async handleCommentCreated(event: ReportCommentCreatedEvent): Promise<void> {
    try {
      await this.notifyCommentCreated(event);
    } catch (error) {
      this.logger.warn(
        `Comment notification event failed for report ${event.reportId}: ${errorMessage(error)}`,
      );
    }
  }

  @OnEvent(ReportEvents.CaptureReady, { suppressErrors: true })
  async handleCaptureReady(event: ReportCaptureReadyEvent): Promise<void> {
    try {
      await this.notifyCaptureReady(event);
    } catch (error) {
      this.logger.warn(
        `Capture notification event failed for report ${event.reportId}: ${errorMessage(error)}`,
      );
    }
  }

  private async notifyCommentCreated(event: ReportCommentCreatedEvent): Promise<void> {
    const report = await this.loadReport(event.reportId);
    if (!report) return;

    const recipients = await this.findRecipients(
      report.workspaceId,
      'emailOnNewComment',
      event.actorUserId,
    );
    if (recipients.length === 0) return;

    const detail = this.toDetail(report);
    await this.sendToRecipients(recipients, {
      subject: reportCommentEmailSubject({ reportTitle: report.title }),
      html: renderReportCommentEmail({
        report: detail,
        authorLabel: event.authorName,
        commentBody: event.body,
      }),
      metadata: {
        notification_type: 'report_comment_created',
        report_id: report.id,
        workspace_id: report.workspaceId,
      },
    });
  }

  private async notifyCaptureReady(event: ReportCaptureReadyEvent): Promise<void> {
    const report = await this.loadReport(event.reportId);
    if (!report) return;

    const recipients = await this.findRecipients(
      report.workspaceId,
      'emailOnNewCapture',
      report.createdById,
    );
    if (recipients.length === 0) return;

    const detail = this.toDetail(report);
    await this.sendToRecipients(recipients, {
      subject: newCaptureEmailSubject({ reportTitle: report.title }),
      html: renderNewCaptureEmail({
        report: detail,
        consoleCount: report._count.consoleLogs,
        networkCount: report._count.networkRequests,
        actionCount: report._count.pageActions,
        errorCount: report._count.runtimeErrors,
      }),
      metadata: {
        notification_type: 'report_capture_ready',
        report_id: report.id,
        workspace_id: report.workspaceId,
      },
    });
  }

  private async findRecipients(
    workspaceId: string,
    preferenceKey: 'emailOnNewCapture' | 'emailOnNewComment',
    excludeUserId?: string | null,
  ): Promise<ReportNotificationRecipient[]> {
    const preferences = await this.prisma.userNotificationPreference.findMany({
      where: {
        workspaceId,
        userId: excludeUserId ? { not: excludeUserId } : undefined,
        [preferenceKey]: true,
        user: {
          status: UserStatus.ACTIVE,
          memberships: {
            some: {
              workspaceId,
              status: MembershipStatus.ACTIVE,
            },
          },
        },
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

    return preferences.map((preference) => ({
      userId: preference.user.id,
      email: preference.user.email,
      displayName: preference.user.displayName,
    }));
  }

  private async sendToRecipients(
    recipients: ReportNotificationRecipient[],
    message: {
      subject: string;
      html: string;
      metadata: Record<string, unknown>;
    },
  ) {
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.mailer.send({
          to: recipient.email,
          subject: message.subject,
          html: message.html,
          metadata: {
            ...message.metadata,
            recipient_user_id: recipient.userId,
            recipient_display_name: recipient.displayName,
          },
        }),
      ),
    );

    const failed = results.filter(
      (result) =>
        result.status === 'rejected' || (result.status === 'fulfilled' && !result.value.sent),
    ).length;

    if (failed > 0) {
      this.logger.warn(`Report notification delivery had ${failed}/${recipients.length} failures.`);
    }
  }

  private async loadReport(reportId: string) {
    return this.prisma.bugReport.findUnique({
      where: { id: reportId },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        project: {
          select: {
            name: true,
          },
        },
        createdBy: {
          select: {
            email: true,
            displayName: true,
          },
        },
        _count: {
          select: {
            consoleLogs: true,
            networkRequests: true,
            pageActions: true,
            runtimeErrors: true,
          },
        },
      },
    });
  }

  private toDetail(report: NonNullable<Awaited<ReturnType<ReportNotificationService['loadReport']>>>): ReportNotificationDetail {
    return {
      title: report.title,
      workspaceName: report.workspace.name,
      projectName: report.project.name,
      pageUrl: report.pageUrl,
      reporterLabel: report.createdBy?.displayName || report.createdBy?.email || null,
      browserLabel: [report.browserName, report.osName].filter(Boolean).join(' on ') || null,
      createdAt: report.createdAt,
      captureUrl: this.buildCaptureUrl(report.shareToken),
    };
  }

  private buildCaptureUrl(shareToken: string): string {
    const baseUrl = this.webBaseUrl();
    const path = `/c/share/${encodeURIComponent(shareToken)}`;
    if (!baseUrl) {
      return path;
    }
    return new URL(path, `${baseUrl}/`).toString();
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
