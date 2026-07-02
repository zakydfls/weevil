export const ReportEvents = {
  CommentCreated: 'report.comment.created',
  CaptureReady: 'report.capture.ready',
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
