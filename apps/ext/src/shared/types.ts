import {
  BackendTraceStatus,
  DomEventKind,
  PageActionKind,
  PerformanceEntryKind,
  RuntimeErrorKind,
} from './constants';

type ValueOf<T> = T[keyof T];
type Optional<T> = T | undefined;

export interface ExtensionSettings {
  apiBaseUrl: string;
  flushIntervalMs: number;
  maxBatchSize: number;
  captureNetworkBodies: boolean;
  captureDomMutations: boolean;
  capturePerformance: boolean;
  redactSensitiveData: boolean;
}

export interface RecorderState {
  isRecording: boolean;
  tabId: number | null;
  windowId: number | null;
  reportId: string | null;
  shareToken?: Optional<string | null>;
  ingestToken?: Optional<string | null>;
  sessionId: string | null;
  startedAt: string | null;
  pageUrl: string | null;
  title: string | null;
  lastError?: Optional<string | null>;
}

export interface CreateReportResponse {
  id: string;
  shareToken: string;
  ingestToken?: Optional<string | null>;
}

export interface CaptureSessionResponse {
  id: string;
  status: string;
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

export interface CreateReportInput {
  title: string;
  description?: Optional<string>;
  source: 'EXTENSION';
  pageUrl?: Optional<string>;
  userAgent?: Optional<string>;
  browserName?: Optional<string>;
  browserVersion?: Optional<string>;
  osName?: Optional<string>;
  viewportWidth?: Optional<number>;
  viewportHeight?: Optional<number>;
  metadata?: Optional<Record<string, unknown>>;
}

export interface UpdateReportInput {
  title?: Optional<string>;
  description?: Optional<string>;
}

export interface CreateCaptureSessionInput {
  startedAt: string;
  recordingStartedAt?: Optional<string>;
  pageUrl?: Optional<string>;
  referrer?: Optional<string>;
  title?: Optional<string>;
  timezone?: Optional<string>;
  locale?: Optional<string>;
  userAgent?: Optional<string>;
  browserName?: Optional<string>;
  browserVersion?: Optional<string>;
  osName?: Optional<string>;
  extensionVersion?: Optional<string>;
  manifestVersion?: Optional<string>;
  tabId?: Optional<string>;
  windowId?: Optional<string>;
  viewportWidth?: Optional<number>;
  viewportHeight?: Optional<number>;
  screenWidth?: Optional<number>;
  screenHeight?: Optional<number>;
  devicePixelRatio?: Optional<number>;
  metadata?: Optional<Record<string, unknown>>;
}

export interface CompleteCaptureSessionInput {
  endedAt?: Optional<string>;
  recordingEndedAt?: Optional<string>;
  durationMs?: Optional<number>;
  status?: Optional<'COMPLETED' | 'FAILED' | 'PAUSED' | 'STARTED'>;
  metadata?: Optional<Record<string, unknown>>;
}

export interface CreateUploadInput {
  kind: 'SCREEN_RECORDING' | 'SCREENSHOT';
  contentType: string;
  byteSize?: Optional<number>;
  checksumSha256?: Optional<string>;
  metadata?: Optional<Record<string, unknown>>;
}

export interface CompleteUploadInput {
  byteSize?: Optional<number>;
  checksumSha256?: Optional<string>;
}

export interface ConsoleTelemetryEntry {
  sessionId?: Optional<string>;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  args?: Optional<Record<string, unknown>>;
  stack?: Optional<string>;
  pageUrl?: Optional<string>;
  timestamp: string;
  offsetMs?: Optional<number>;
}

export interface NetworkTelemetryEntry {
  sessionId?: Optional<string>;
  requestId?: Optional<string>;
  method: string;
  url: string;
  statusCode?: Optional<number>;
  durationMs?: Optional<number>;
  requestHeaders?: Optional<Record<string, unknown>>;
  responseHeaders?: Optional<Record<string, unknown>>;
  requestBody?: Optional<string>;
  responseBody?: Optional<string>;
  error?: Optional<string>;
  startedAt: string;
  endedAt?: Optional<string>;
  offsetMs?: Optional<number>;
}

export interface PageActionTelemetryEntry {
  sessionId?: Optional<string>;
  kind: ValueOf<typeof PageActionKind>;
  selector?: Optional<string>;
  nodePath?: Optional<string>;
  label?: Optional<string>;
  tagName?: Optional<string>;
  textPreview?: Optional<string>;
  valuePreview?: Optional<string>;
  pageUrl?: Optional<string>;
  x?: Optional<number>;
  y?: Optional<number>;
  scrollX?: Optional<number>;
  scrollY?: Optional<number>;
  offsetMs?: Optional<number>;
  occurredAt: string;
  metadata?: Optional<Record<string, unknown>>;
}

export interface RuntimeErrorTelemetryEntry {
  sessionId?: Optional<string>;
  kind: ValueOf<typeof RuntimeErrorKind>;
  message: string;
  sourceUrl?: Optional<string>;
  lineNumber?: Optional<number>;
  columnNumber?: Optional<number>;
  stack?: Optional<string>;
  componentStack?: Optional<string>;
  pageUrl?: Optional<string>;
  offsetMs?: Optional<number>;
  occurredAt: string;
  metadata?: Optional<Record<string, unknown>>;
}

export interface PerformanceTelemetryEntry {
  sessionId?: Optional<string>;
  kind: ValueOf<typeof PerformanceEntryKind>;
  name: string;
  value?: Optional<number>;
  startTimeMs?: Optional<number>;
  durationMs?: Optional<number>;
  rating?: Optional<string>;
  initiatorType?: Optional<string>;
  pageUrl?: Optional<string>;
  offsetMs?: Optional<number>;
  occurredAt: string;
  metadata?: Optional<Record<string, unknown>>;
}

export interface DomEventTelemetryEntry {
  sessionId?: Optional<string>;
  kind: ValueOf<typeof DomEventKind>;
  selector?: Optional<string>;
  nodePath?: Optional<string>;
  mutationType?: Optional<string>;
  previousValue?: Optional<string>;
  nextValue?: Optional<string>;
  pageUrl?: Optional<string>;
  offsetMs?: Optional<number>;
  occurredAt: string;
  attributes?: Optional<Record<string, unknown>>;
  metadata?: Optional<Record<string, unknown>>;
}

export interface BackendTraceTelemetryEntry {
  sessionId?: Optional<string>;
  traceId?: Optional<string>;
  spanId?: Optional<string>;
  parentSpanId?: Optional<string>;
  serviceName?: Optional<string>;
  operationName: string;
  status?: Optional<ValueOf<typeof BackendTraceStatus>>;
  method?: Optional<string>;
  url?: Optional<string>;
  statusCode?: Optional<number>;
  durationMs?: Optional<number>;
  startedAt: string;
  endedAt?: Optional<string>;
  offsetMs?: Optional<number>;
  metadata?: Optional<Record<string, unknown>>;
}

export interface TelemetryBatch {
  consoleLogs: ConsoleTelemetryEntry[];
  networkRequests: NetworkTelemetryEntry[];
  pageActions: PageActionTelemetryEntry[];
  runtimeErrors: RuntimeErrorTelemetryEntry[];
  performanceEntries: PerformanceTelemetryEntry[];
  domEvents: DomEventTelemetryEntry[];
  backendTraces: BackendTraceTelemetryEntry[];
}

export interface PageTelemetryMessage {
  type: string;
  payload: unknown;
}

export interface RuntimeMessage<TPayload = unknown> {
  type: string;
  payload?: Optional<TPayload>;
}

export interface OffscreenRecordingResult {
  dataUrl: string;
  contentType: string;
  byteSize: number;
  durationMs: number;
}

export interface CaptureCompletedPayload {
  artifactKind: 'recording' | 'screenshot';
  reportId: string;
  shareToken?: Optional<string | null>;
  title?: Optional<string | null>;
  description?: Optional<string | null>;
  pageUrl?: Optional<string | null>;
  dashboardUrl?: Optional<string>;
  previewDataUrl?: Optional<string>;
  durationMs?: Optional<number>;
  byteSize?: Optional<number>;
  completedAt: string;
  isSaved?: Optional<boolean>;
}

export interface SubmitCaptureReviewInput {
  title?: Optional<string>;
  description?: Optional<string>;
}
