export const API_PREFIX = 'v1' as const;

export const ApiRoutes = {
  Docs: 'docs',
  Health: 'health',
  Reports: 'reports',
  ReportUploads: 'reports/:reportId/uploads',
  ReportUploadComplete: 'reports/:reportId/uploads/:uploadId/complete',
  ReportUploadDownloadUrl: 'reports/:reportId/uploads/:uploadId/download-url',
  ReportShare: 'reports/share/:shareToken',
  ReportShareUploadDownloadUrl: 'reports/share/:shareToken/uploads/:uploadId/download-url',
  ReportConsoleLogs: 'reports/:reportId/telemetry/console',
  ReportNetworkRequests: 'reports/:reportId/telemetry/network',
  ReportCaptureSessions: 'reports/:reportId/capture-sessions',
  ReportCaptureSessionComplete: 'reports/:reportId/capture-sessions/:sessionId/complete',
  ReportPageActions: 'reports/:reportId/telemetry/actions',
  ReportRuntimeErrors: 'reports/:reportId/telemetry/errors',
  ReportPerformanceEntries: 'reports/:reportId/telemetry/performance',
  ReportDomEvents: 'reports/:reportId/telemetry/dom-events',
  ReportBackendTraces: 'reports/:reportId/telemetry/backend-traces',
  ReportTimeline: 'reports/:reportId/timeline',
  ReportComments: 'reports/:reportId/comments',
  ReportCommentsRelative: ':reportId/comments',
  ReportBoardRelative: ':reportId/board',
  ReportAssigneesRelative: ':reportId/assignees',
  ReportCaptureSessionsRelative: ':reportId/capture-sessions',
  ReportCaptureSessionCompleteRelative: ':reportId/capture-sessions/:sessionId/complete',
  ReportTimelineRelative: ':reportId/timeline',
  ReportShareRelative: 'share/:shareToken',
} as const;

export const RouteParams = {
  ReportId: 'reportId',
  UploadId: 'uploadId',
  SessionId: 'sessionId',
  ShareToken: 'shareToken',
} as const;
