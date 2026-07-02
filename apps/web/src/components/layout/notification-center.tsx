'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CheckCheck,
  Inbox,
  Loader2,
  MessageSquareText,
  UserPlus,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient, getApiBaseUrl } from '@/lib/api/client';
import type { InAppNotification } from '@/lib/api/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/auth-context';

export function NotificationCenter() {
  const auth = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  const hasUnread = unreadCount > 0;
  const unreadLabel = unreadCount > 99 ? '99+' : String(unreadCount);

  async function refresh() {
    if (auth.status !== 'authenticated') return;
    setIsLoading(true);
    try {
      const [items, count] = await Promise.all([
        apiClient.listInAppNotifications(30),
        apiClient.getInAppNotificationUnreadCount(),
      ]);
      setNotifications(items);
      setUnreadCount(count.unreadCount);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    void refresh();
  }, [auth.status, auth.user?.id]);

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    const source = new EventSource(`${getApiBaseUrl()}/in-app-notifications/stream`, {
      withCredentials: true,
    });

    function handleSnapshot(event: MessageEvent<string>) {
      const payload = safeJsonParse(event.data);
      if (payload && typeof payload === 'object' && 'unreadCount' in payload) {
        const nextCount = Number((payload as { unreadCount?: unknown }).unreadCount);
        if (Number.isFinite(nextCount)) setUnreadCount(nextCount);
      }
    }

    function handleChanged() {
      void refresh();
    }

    source.addEventListener('notification.snapshot', handleSnapshot);
    source.addEventListener('notification.changed', handleChanged);
    return () => {
      source.removeEventListener('notification.snapshot', handleSnapshot);
      source.removeEventListener('notification.changed', handleChanged);
      source.close();
    };
  }, [auth.status, auth.user?.id]);

  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen]);

  async function handleOpenNotification(notification: InAppNotification) {
    if (!notification.readAt) {
      await apiClient.markInAppNotificationRead(notification.id).catch(() => undefined);
    }
    if (notification.workspaceSlug && notification.workspaceSlug !== auth.workspace?.slug) {
      await auth.switchWorkspace(notification.workspaceSlug).catch(() => undefined);
    }
    setIsOpen(false);
    setNotifications((current) =>
      current.map((item) =>
        item.id === notification.id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item,
      ),
    );
    setUnreadCount((current) => Math.max(0, current - (notification.readAt ? 0 : 1)));
    router.push(toAppPath(notification.actionUrl));
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await apiClient.markAllInAppNotificationsRead();
      setUnreadCount(0);
      setNotifications((current) =>
        current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      );
    } finally {
      setIsMarkingAll(false);
    }
  }

  const grouped = useMemo(
    () => notifications.map((notification) => ({ notification, icon: notificationIcon(notification.type) })),
    [notifications],
  );

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={hasUnread ? `${unreadCount} unread notifications` : 'Notifications'}
        >
          <Bell className="h-4 w-4" aria-hidden />
          {hasUnread ? (
            <>
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[var(--primary)] ring-2 ring-[var(--bg)]" />
              <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[var(--primary)] px-1 font-mono text-[10px] font-semibold leading-5 text-white">
                {unreadLabel}
              </span>
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-1rem))] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--divider)] bg-[var(--surface)] px-3 py-2.5">
          <div>
            <div className="text-sm font-semibold text-[var(--ink)]">Notifications</div>
            <div className="font-mono text-[10px] text-[var(--ink-faint)]">
              {hasUnread ? `${unreadCount} unread` : 'all caught up'}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!hasUnread || isMarkingAll}
            onClick={() => void handleMarkAllRead()}
          >
            {isMarkingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCheck className="h-3.5 w-3.5" aria-hidden />}
            Read all
          </Button>
        </div>
        <ScrollArea className="max-h-[28rem]">
          {isLoading && notifications.length === 0 ? (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-[var(--ink-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Loading notifications
            </div>
          ) : grouped.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-[var(--surface)] text-[var(--ink-muted)]">
                <Inbox className="h-5 w-5" aria-hidden />
              </span>
              <div className="mt-3 text-sm font-semibold text-[var(--ink)]">No notifications yet</div>
              <p className="mt-1 text-sm leading-5 text-[var(--ink-muted)]">
                Workspace activity that needs your attention will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--divider)]">
              {grouped.map(({ notification, icon: Icon }) => {
                const unread = !notification.readAt;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => void handleOpenNotification(notification)}
                    className={cn(
                      'grid w-full grid-cols-[2rem_minmax(0,1fr)_auto] gap-2 px-3 py-3 text-left transition-colors hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--primary)]',
                      unread && 'bg-[var(--primary-subtle)]/45',
                    )}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded-md bg-[var(--surface)] text-[var(--primary)] ring-1 ring-[var(--border)]">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-[var(--ink)]">
                          {notification.title}
                        </span>
                        {unread ? (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                        ) : null}
                      </span>
                      {notification.body ? (
                        <span className="mt-0.5 block truncate text-sm text-[var(--ink-muted)]">
                          {notification.body}
                        </span>
                      ) : null}
                      <span className="mt-1 block truncate font-mono text-[10px] text-[var(--ink-faint)]">
                        {[notification.workspaceName, relativeTime(notification.createdAt)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

function notificationIcon(type: string): typeof Bell {
  if (type.includes('comment')) return MessageSquareText;
  if (type.includes('capture')) return Video;
  if (type.includes('workspace_join')) return UserPlus;
  return Bell;
}

function toAppPath(value: string | null): string {
  if (!value) return '/captures';
  if (value.startsWith('/')) return value;
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}` || '/captures';
  } catch {
    return '/captures';
  }
}

function relativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return '';
  const deltaMs = Date.now() - timestamp;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (deltaMs < minute) return 'now';
  if (deltaMs < hour) return `${Math.floor(deltaMs / minute)}m`;
  if (deltaMs < day) return `${Math.floor(deltaMs / hour)}h`;
  return `${Math.floor(deltaMs / day)}d`;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
