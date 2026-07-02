import { Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Sse } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { CurrentAuth } from '@weevil/auth';
import type { AuthContext } from '@weevil/auth';
import { filter, from, interval, map, merge, startWith, switchMap, type Observable } from 'rxjs';
import { InAppNotificationService } from '../application/in-app-notification.service';

@Controller('in-app-notifications')
export class InAppNotificationsController {
  constructor(private readonly notifications: InAppNotificationService) {}

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query('limit') rawLimit?: string) {
    return this.notifications.listForUser(auth.user.id, parseLimit(rawLimit));
  }

  @Get('unread-count')
  async unreadCount(@CurrentAuth() auth: AuthContext) {
    return { unreadCount: await this.notifications.unreadCount(auth.user.id) };
  }

  @Sse('stream')
  stream(@CurrentAuth() auth: AuthContext): Observable<MessageEvent> {
    const userId = auth.user.id;
    const snapshot$ = interval(15_000).pipe(
      startWith(0),
      switchMap(() => from(this.notifications.unreadCount(userId))),
      map((unreadCount) => ({
        type: 'notification.snapshot',
        data: { unreadCount },
      })),
    );
    const changed$ = this.notifications.watch().pipe(
      filter((event) => event.userId === userId),
      map(() => ({
        type: 'notification.changed',
        data: {},
      })),
    );

    return merge(snapshot$, changed$);
  }

  @Patch(':notificationId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(@CurrentAuth() auth: AuthContext, @Param('notificationId') notificationId: string) {
    await this.notifications.markRead(auth.user.id, notificationId);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentAuth() auth: AuthContext) {
    await this.notifications.markAllRead(auth.user.id);
  }
}

function parseLimit(value: string | undefined): number {
  if (!value) return 30;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 30;
}
