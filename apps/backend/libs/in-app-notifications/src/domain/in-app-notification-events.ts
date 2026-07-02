export const InAppNotificationEvents = {
  Requested: 'in-app-notification.requested',
} as const;

export interface InAppNotificationRequestedItem {
  userId: string;
  workspaceId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  actionUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface InAppNotificationRequestedEvent {
  notifications: InAppNotificationRequestedItem[];
}
