/**
 * In-app notification event contract.
 *
 * Lives in @weevil/contracts (dependency-free) so producers (@weevil/auth,
 * @weevil/reports) and the consumer (@weevil/in-app-notifications) can share it
 * WITHOUT importing each other's barrels. Importing the in-app-notifications
 * barrel from inside @weevil/auth created a circular require
 * (auth → in-app-notifications → controller → auth) that left `CurrentAuth`
 * undefined at decoration time in production. Keep this file import-free.
 */
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
