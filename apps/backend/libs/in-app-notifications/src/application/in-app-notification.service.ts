import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@weevil/database';
import { Prisma } from '@weevil/prisma-client';
import { Observable, Subject } from 'rxjs';
import {
  InAppNotificationEvents,
  type InAppNotificationRequestedEvent,
  type InAppNotificationRequestedItem,
} from '../domain/in-app-notification-events';

export interface InAppNotificationDto {
  id: string;
  workspaceId: string | null;
  workspaceSlug: string | null;
  workspaceName: string | null;
  type: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  metadata: unknown;
  readAt: string | null;
  createdAt: string;
}

export interface InAppNotificationLiveEvent {
  userId: string;
}

@Injectable()
export class InAppNotificationService {
  private readonly updates = new Subject<InAppNotificationLiveEvent>();

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(InAppNotificationEvents.Requested, { suppressErrors: true })
  async handleRequested(event: InAppNotificationRequestedEvent): Promise<void> {
    await this.createMany(event.notifications);
  }

  watch(): Observable<InAppNotificationLiveEvent> {
    return this.updates.asObservable();
  }

  async createMany(notifications: InAppNotificationRequestedItem[]): Promise<void> {
    const rows = notifications
      .map((notification) => ({
        userId: notification.userId,
        workspaceId: notification.workspaceId ?? null,
        type: notification.type.trim(),
        title: notification.title.trim(),
        body: notification.body?.trim() || null,
        actionUrl: notification.actionUrl?.trim() || null,
        metadata: notification.metadata,
      }))
      .filter((notification) => notification.userId && notification.type && notification.title);

    if (rows.length === 0) return;

    await this.prisma.inAppNotification.createMany({
      data: rows.map((row) => ({
        userId: row.userId,
        workspaceId: row.workspaceId,
        type: row.type,
        title: row.title,
        body: row.body,
        actionUrl: row.actionUrl,
        ...(row.metadata ? { metadata: row.metadata as Prisma.InputJsonValue } : {}),
      })),
    });

    for (const userId of new Set(rows.map((row) => row.userId))) {
      this.updates.next({ userId });
    }
  }

  async listForUser(userId: string, limit = 30): Promise<InAppNotificationDto[]> {
    const rows = await this.prisma.inAppNotification.findMany({
      where: { userId },
      include: {
        workspace: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: clampLimit(limit),
    });

    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      workspaceSlug: row.workspace?.slug ?? null,
      workspaceName: row.workspace?.name ?? null,
      type: row.type,
      title: row.title,
      body: row.body,
      actionUrl: row.actionUrl,
      metadata: row.metadata,
      readAt: row.readAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.inAppNotification.count({
      where: {
        userId,
        readAt: null,
      },
    });
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.prisma.inAppNotification.updateMany({
      where: {
        id: notificationId,
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
    this.updates.next({ userId });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.inAppNotification.updateMany({
      where: {
        userId,
        readAt: null,
      },
      data: {
        readAt: new Date(),
      },
    });
    this.updates.next({ userId });
  }
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) return 30;
  return Math.min(Math.max(Math.floor(value), 1), 50);
}
