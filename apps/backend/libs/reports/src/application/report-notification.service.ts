import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppConfigService } from '@weevil/config';
// Event contract from @weevil/contracts — never import the
// @weevil/in-app-notifications barrel from producer libs (circular require).
import { InAppNotificationEvents } from '@weevil/contracts';
import { PrismaService } from '@weevil/database';
import {
  MailerService,
  newCaptureEmailSubject,
  renderNewCaptureEmail,
  renderReportAssignedEmail,
  renderReportCommentEmail,
  reportAssignedEmailSubject,
  reportCommentEmailSubject,
  type ReportNotificationDetail,
} from '@weevil/notifications';
import { MembershipStatus, UserStatus } from '@weevil/prisma-client';
import {
  ReportEvents,
  type ReportAssigneesChangedEvent,
  type ReportCaptureCreatedEvent,
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
    private readonly eventEmitter: EventEmitter2,
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

  @OnEvent(ReportEvents.CaptureCreated, { suppressErrors: true })
  async handleCaptureCreated(event: ReportCaptureCreatedEvent): Promise<void> {
    try {
      await this.notifyCaptureCreated(event);
    } catch (error) {
      this.logger.warn(
        `Capture notification event failed for report ${event.reportId}: ${errorMessage(error)}`,
      );
    }
  }

  @OnEvent(ReportEvents.AssigneesChanged, { suppressErrors: true })
  async handleAssigneesChanged(event: ReportAssigneesChangedEvent): Promise<void> {
    try {
      await this.notifyAssigneesChanged(event);
    } catch (error) {
      this.logger.warn(
        `Assignee notification event failed for report ${event.reportId}: ${errorMessage(error)}`,
      );
    }
  }

  private async notifyCommentCreated(event: ReportCommentCreatedEvent): Promise<void> {
    const report = await this.loadReport(event.reportId);
    if (!report) return;

    const mentionedUserIds = [...new Set(event.mentionedUserIds ?? [])].filter((id) => id !== event.actorUserId);
    const mentionedRecipients = mentionedUserIds.length
      ? await this.findAssignedRecipients(report.workspaceId, mentionedUserIds)
      : [];
    const commentPath = `${this.buildPrivateCapturePath(report.id)}${event.commentId ? `#comment-${encodeURIComponent(event.commentId)}` : ''}`;
    this.emitInAppNotifications(mentionedRecipients, {
      workspaceId: report.workspaceId,
      type: 'report_comment_mentioned',
      title: `${event.authorName} mentioned you`,
      body: report.title,
      actionUrl: commentPath,
      metadata: { report_id: report.id, comment_id: event.commentId, workspace_slug: report.workspace.slug },
    });
    const mentionEmailRecipients = mentionedUserIds.length
      ? await this.findAssignedEmailRecipients(report.workspaceId, mentionedUserIds, 'emailOnMention')
      : [];
    if (mentionEmailRecipients.length) {
      const baseUrl = this.webBaseUrl();
      await this.sendToRecipients(mentionEmailRecipients, {
        subject: reportCommentEmailSubject({ reportTitle: report.title, mentioned: true }),
        html: renderReportCommentEmail({
          report: this.toDetail(report, baseUrl ? new URL(commentPath, `${baseUrl}/`).toString() : commentPath),
          authorLabel: event.authorName,
          commentBody: event.body,
          mentioned: true,
        }),
        metadata: { notification_type: 'report_comment_mentioned', report_id: report.id, workspace_id: report.workspaceId, comment_id: event.commentId },
      });
    }

    const recipients = (await this.findRecipients(
      report.workspaceId,
      'emailOnNewComment',
      event.actorUserId,
    )).filter((recipient) => !mentionedUserIds.includes(recipient.userId));
    if (recipients.length === 0) return;

    const detail = this.toDetail(report);
    this.emitInAppNotifications(recipients, {
      workspaceId: report.workspaceId,
      type: 'report_comment_created',
      title: `${event.authorName} commented`,
      body: report.title,
      actionUrl: this.buildCapturePath(report.shareToken),
      metadata: {
        report_id: report.id,
        workspace_slug: report.workspace.slug,
      },
    });
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

  private async notifyCaptureCreated(event: ReportCaptureCreatedEvent): Promise<void> {
    const report = await this.loadReport(event.reportId);
    if (!report) return;

    const recipients = await this.findRecipients(
      report.workspaceId,
      'emailOnNewCapture',
      event.actorUserId ?? report.createdById,
    );
    if (recipients.length === 0) return;

    const detail = this.toDetail(report);
    this.emitInAppNotifications(recipients, {
      workspaceId: report.workspaceId,
      type: 'report_capture_created',
      title: 'New capture created',
      body: `${report.title} · ${report.workspace.name}`,
      actionUrl: this.buildCapturePath(report.shareToken),
      metadata: {
        report_id: report.id,
        workspace_slug: report.workspace.slug,
      },
    });
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
        notification_type: 'report_capture_created',
        report_id: report.id,
        workspace_id: report.workspaceId,
      },
    });
  }

  private async notifyAssigneesChanged(event: ReportAssigneesChangedEvent): Promise<void> {
    const addedUserIds = event.addedUserIds.filter((userId) => userId !== event.actorUserId);
    if (addedUserIds.length === 0) return;

    const report = await this.loadReport(event.reportId);
    if (!report) return;

    const recipients = await this.findAssignedRecipients(report.workspaceId, addedUserIds);
    if (recipients.length === 0) return;

    this.emitInAppNotifications(recipients, {
      workspaceId: report.workspaceId,
      type: 'report_assigned',
      title: 'You were assigned',
      body: report.title,
      actionUrl: this.buildPrivateCapturePath(report.id),
      metadata: {
        report_id: report.id,
        workspace_slug: report.workspace.slug,
      },
    });

    const emailRecipients = await this.findAssignedEmailRecipients(report.workspaceId, addedUserIds);
    if (emailRecipients.length === 0) return;

    const detail = this.toDetail(report, this.buildPrivateCaptureUrl(report.id));
    await this.sendToRecipients(emailRecipients, {
      subject: reportAssignedEmailSubject({ reportTitle: report.title }),
      html: '',
      metadata: {
        notification_type: 'report_assigned',
        report_id: report.id,
        workspace_id: report.workspaceId,
      },
      renderHtml: (recipient) =>
        renderReportAssignedEmail({
          report: detail,
          assigneeLabel: recipient.displayName || recipient.email,
        }),
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

  private async findAssignedRecipients(
    workspaceId: string,
    userIds: string[],
  ): Promise<ReportNotificationRecipient[]> {
    const members = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        status: MembershipStatus.ACTIVE,
        user: {
          id: { in: userIds },
          status: UserStatus.ACTIVE,
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

    return members.map((member) => ({
      userId: member.user.id,
      email: member.user.email,
      displayName: member.user.displayName,
    }));
  }

  private async findAssignedEmailRecipients(
    workspaceId: string,
    userIds: string[],
    preferenceKey: 'emailOnAssignment' | 'emailOnMention' = 'emailOnAssignment',
  ): Promise<ReportNotificationRecipient[]> {
    const preferences = await this.prisma.userNotificationPreference.findMany({
      where: {
        workspaceId,
        userId: { in: userIds },
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
      renderHtml?: (recipient: ReportNotificationRecipient) => string;
    },
  ) {
    const results = await Promise.allSettled(
      recipients.map((recipient) =>
        this.mailer.send({
          to: recipient.email,
          subject: message.subject,
          html: message.renderHtml ? message.renderHtml(recipient) : message.html,
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

  private emitInAppNotifications(
    recipients: ReportNotificationRecipient[],
    message: {
      workspaceId: string;
      type: string;
      title: string;
      body: string;
      actionUrl: string;
      metadata: Record<string, unknown>;
    },
  ): void {
    this.eventEmitter.emit(InAppNotificationEvents.Requested, {
      notifications: recipients.map((recipient) => ({
        userId: recipient.userId,
        workspaceId: message.workspaceId,
        type: message.type,
        title: message.title,
        body: message.body,
        actionUrl: message.actionUrl,
        metadata: {
          ...message.metadata,
          recipient_user_id: recipient.userId,
        },
      })),
    });
  }

  private async loadReport(reportId: string) {
    return this.prisma.bugReport.findFirst({
      where: {
        id: reportId,
        deletedAt: null,
      },
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

  private toDetail(
    report: NonNullable<Awaited<ReturnType<ReportNotificationService['loadReport']>>>,
    captureUrl = this.buildCaptureUrl(report.shareToken),
  ): ReportNotificationDetail {
    return {
      title: report.title,
      workspaceName: report.workspace.name,
      projectName: report.project.name,
      pageUrl: report.pageUrl,
      reporterLabel: report.createdBy?.displayName || report.createdBy?.email || null,
      browserLabel: [report.browserName, report.osName].filter(Boolean).join(' on ') || null,
      createdAt: report.createdAt,
      captureUrl,
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

  private buildCapturePath(shareToken: string): string {
    return `/c/share/${encodeURIComponent(shareToken)}`;
  }

  private buildPrivateCaptureUrl(reportId: string): string {
    const baseUrl = this.webBaseUrl();
    const path = this.buildPrivateCapturePath(reportId);
    if (!baseUrl) {
      return path;
    }
    return new URL(path, `${baseUrl}/`).toString();
  }

  private buildPrivateCapturePath(reportId: string): string {
    return `/c/${encodeURIComponent(reportId)}`;
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
