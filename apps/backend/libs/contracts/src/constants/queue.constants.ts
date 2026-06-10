export const QueueExchange = {
  Reports: 'weevil.reports',
} as const;

export const QueueNames = {
  ArtifactProcessing: 'weevil.artifact-processing',
} as const;

export const QueueRoutingKeys = {
  UploadCompleted: 'report.upload.completed',
} as const;

export const QueueEventTypes = {
  UploadCompleted: 'upload.completed',
} as const;

export type QueueEventType = (typeof QueueEventTypes)[keyof typeof QueueEventTypes];

export interface UploadCompletedQueueMessage extends Record<string, unknown> {
  eventType: typeof QueueEventTypes.UploadCompleted;
  reportId: string;
  uploadId: string;
  occurredAt: string;
}
