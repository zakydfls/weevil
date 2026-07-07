export const ReportEvents = {
  CommentCreated: 'report.comment.created',
  CaptureCreated: 'report.capture.created',
  CaptureReady: 'report.capture.ready',
  AssigneesChanged: 'report.assignees.changed',
} as const;

export interface ReportCommentCreatedEvent {
  reportId: string;
  actorUserId?: string | null;
  authorName: string;
  body: string;
}

export interface ReportCaptureReadyEvent {
  reportId: string;
}

export interface ReportCaptureCreatedEvent {
  reportId: string;
  actorUserId?: string | null;
}

export interface ReportAssigneesChangedEvent {
  reportId: string;
  actorUserId?: string | null;
  addedUserIds: string[];
}
