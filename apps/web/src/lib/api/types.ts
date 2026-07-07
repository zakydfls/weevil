export type ReportStatus = 'DRAFT' | 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED' | 'ARCHIVED';

export interface ReportReporter {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface ReportAssignee {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  assignedAt: string;
}

export interface ReportSummary {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: ReportStatus;
  source: 'DASHBOARD' | 'EXTENSION' | 'API';
  shareToken: string;
  pageUrl?: string | null;
  browserName?: string | null;
  osName?: string | null;
  boardColumn: string;
  boardOrder?: number | null;
  uploadCount?: number;
  consoleLogCount?: number;
  networkRequestCount?: number;
  commentCount?: number;
  actionCount?: number;
  runtimeErrorCount?: number;
  performanceEntryCount?: number;
  domEventCount?: number;
  backendTraceCount?: number;
  reporter?: ReportReporter | null;
  assignees: ReportAssignee[];
  primaryRecording?: ReportUpload | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListReportsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  source?: 'DASHBOARD' | 'EXTENSION' | 'API';
  hasRecording?: boolean;
}

export interface UpdateReportBoardInput {
  boardColumn: string;
  targetIndex?: number;
}

export interface UpdateReportAssigneesInput {
  assigneeUserIds: string[];
}

export interface PaginatedReportsResponse {
  items: ReportSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface NotificationPreferences {
  emailOnNewCapture: boolean;
  emailOnNewComment: boolean;
}

export interface WorkspaceMemberSummary {
  id: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  status: string;
  extraPermissions: string[];
  deniedPermissions: string[];
  effectivePermissions: string[];
  joinedAt: string | null;
  lastActiveAt: string | null;
  expiresAt?: string;
  inviteUrl?: string;
  requestKind?: 'MEMBER' | 'INVITE' | 'JOIN_REQUEST';
}

export interface InAppNotification {
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

export interface ReportUpload {
  id: string;
  kind: string;
  status: string;
  bucket: string;
  objectKey: string;
  contentType: string;
  byteSize?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export type TimelineEntryKind =
  | 'SESSION'
  | 'UPLOAD'
  | 'EVENT'
  | 'CONSOLE'
  | 'NETWORK'
  | 'ACTION'
  | 'ERROR'
  | 'PERFORMANCE'
  | 'DOM'
  | 'BACKEND';

export interface TimelineEntry {
  id: string;
  type: TimelineEntryKind;
  severity: 'neutral' | 'info' | 'warning' | 'danger' | 'success';
  title: string;
  subtitle?: string | null;
  timestamp: string;
  offsetMs?: number | null;
  payload?: unknown;
}

export interface CaptureSession {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  durationMs?: number | null;
  recordingStartedAt?: string | null;
  recordingEndedAt?: string | null;
  pageUrl?: string | null;
  referrer?: string | null;
  title?: string | null;
  timezone?: string | null;
  locale?: string | null;
  userAgent?: string | null;
  browserName?: string | null;
  browserVersion?: string | null;
  osName?: string | null;
  extensionVersion?: string | null;
  manifestVersion?: string | null;
  tabId?: string | null;
  windowId?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  screenWidth?: number | null;
  screenHeight?: number | null;
  devicePixelRatio?: number | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ReportEvent {
  id: string;
  kind: string;
  payload?: unknown;
  createdAt: string;
}

export interface ConsoleLogEntry {
  id: string;
  sessionId?: string | null;
  level: string;
  message: string;
  args?: unknown;
  stack?: string | null;
  pageUrl?: string | null;
  offsetMs?: number | null;
  timestamp: string;
}

export interface NetworkRequestEntry {
  id: string;
  sessionId?: string | null;
  requestId?: string | null;
  method: string;
  url: string;
  statusCode?: number | null;
  durationMs?: number | null;
  requestHeaders?: unknown;
  responseHeaders?: unknown;
  requestBody?: string | null;
  responseBody?: string | null;
  error?: string | null;
  offsetMs?: number | null;
  startedAt: string;
  endedAt?: string | null;
}

export interface PageActionEntry {
  id: string;
  sessionId?: string | null;
  kind: string;
  selector?: string | null;
  nodePath?: string | null;
  label?: string | null;
  tagName?: string | null;
  textPreview?: string | null;
  valuePreview?: string | null;
  pageUrl?: string | null;
  x?: number | null;
  y?: number | null;
  scrollX?: number | null;
  scrollY?: number | null;
  offsetMs?: number | null;
  occurredAt: string;
  metadata?: unknown;
}

export interface RuntimeErrorEntry {
  id: string;
  sessionId?: string | null;
  kind: string;
  message: string;
  sourceUrl?: string | null;
  lineNumber?: number | null;
  columnNumber?: number | null;
  stack?: string | null;
  componentStack?: string | null;
  pageUrl?: string | null;
  offsetMs?: number | null;
  occurredAt: string;
  metadata?: unknown;
}

export interface PerformanceEntry {
  id: string;
  sessionId?: string | null;
  kind: string;
  name: string;
  value?: number | null;
  startTimeMs?: number | null;
  durationMs?: number | null;
  rating?: string | null;
  initiatorType?: string | null;
  pageUrl?: string | null;
  offsetMs?: number | null;
  occurredAt: string;
  metadata?: unknown;
}

export interface DomEventEntry {
  id: string;
  sessionId?: string | null;
  kind: string;
  selector?: string | null;
  nodePath?: string | null;
  mutationType?: string | null;
  previousValue?: string | null;
  nextValue?: string | null;
  pageUrl?: string | null;
  offsetMs?: number | null;
  occurredAt: string;
  attributes?: unknown;
  metadata?: unknown;
}

export interface BackendTraceEntry {
  id: string;
  sessionId?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  parentSpanId?: string | null;
  serviceName?: string | null;
  operationName: string;
  status: string;
  method?: string | null;
  url?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  startedAt: string;
  endedAt?: string | null;
  offsetMs?: number | null;
  metadata?: unknown;
}

export interface ReportComment {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetail extends ReportSummary {
  userAgent?: string | null;
  browserVersion?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  metadata?: unknown;
  captureSessions: CaptureSession[];
  uploads: ReportUpload[];
  events: ReportEvent[];
  consoleLogs: ConsoleLogEntry[];
  networkRequests: NetworkRequestEntry[];
  pageActions: PageActionEntry[];
  runtimeErrors: RuntimeErrorEntry[];
  performanceEntries: PerformanceEntry[];
  domEvents: DomEventEntry[];
  backendTraces: BackendTraceEntry[];
  timeline: TimelineEntry[];
  comments: ReportComment[];
}

export interface CreateReportInput {
  title: string;
  description?: string;
  source: 'DASHBOARD' | 'EXTENSION' | 'API';
  pageUrl?: string;
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateReportInput {
  title?: string;
  description?: string;
}

export interface CreateUploadInput {
  kind: 'SCREEN_RECORDING' | 'CONSOLE_LOGS' | 'NETWORK_LOGS' | 'SCREENSHOT' | 'DOM_SNAPSHOT' | 'HAR' | 'OTHER';
  contentType: string;
  byteSize?: number;
  checksumSha256?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateUploadResponse {
  uploadId: string;
  objectKey: string;
  putUrl: string;
  expiresInSeconds: number;
}

export interface DownloadUrlResponse {
  getUrl: string;
  expiresInSeconds: number;
}

export interface CreateCaptureSessionInput {
  startedAt: string;
  recordingStartedAt?: string;
  pageUrl?: string;
  referrer?: string;
  title?: string;
  timezone?: string;
  locale?: string;
  userAgent?: string;
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  extensionVersion?: string;
  manifestVersion?: string;
  tabId?: string;
  windowId?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  screenWidth?: number;
  screenHeight?: number;
  devicePixelRatio?: number;
  metadata?: Record<string, unknown>;
}

export interface CompleteCaptureSessionInput {
  endedAt?: string;
  recordingEndedAt?: string;
  durationMs?: number;
  status?: 'COMPLETED' | 'FAILED' | 'PAUSED' | 'STARTED';
  metadata?: Record<string, unknown>;
}

export interface AttachTelemetryInput<TEntry> {
  entries: TEntry[];
}
