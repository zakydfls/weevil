/**
 * Re-exported from @weevil/contracts — the contract lives there so producers
 * (@weevil/auth, @weevil/reports) never need to import THIS lib's barrel.
 * Importing this barrel from @weevil/auth created a circular require
 * (auth → in-app-notifications → controller → auth) that crashed production
 * with `CurrentAuth is not a function`. See contracts/events for details.
 */
export {
  InAppNotificationEvents,
  type InAppNotificationRequestedItem,
  type InAppNotificationRequestedEvent,
} from '@weevil/contracts';
