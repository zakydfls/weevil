import {
  BackendTraceStatus,
  CaptureSessionStatus,
  DomEventKind,
  PerformanceEntryKind,
  RuntimeErrorKind,
  PageActionKind,
  ReportSource,
} from '@weevil/prisma-client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsDate,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsEnum(ReportSource)
  source?: ReportSource;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  browserName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  browserVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  osName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  viewportWidth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  viewportHeight?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateReportDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}

export interface ReportSummaryResponse {
  id: string;
  workspaceId: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: string;
  source: string;
  shareToken: string;
  pageUrl?: string | null;
  browserName?: string | null;
  osName?: string | null;
  uploadCount?: number;
  consoleLogCount?: number;
  networkRequestCount?: number;
  commentCount?: number;
  actionCount?: number;
  runtimeErrorCount?: number;
  performanceEntryCount?: number;
  domEventCount?: number;
  backendTraceCount?: number;
  reporter?: ReportReporterResponse | null;
  primaryRecording?: ReportUploadResponse | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportReporterResponse {
  id: string;
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export class ListReportsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 12;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  search?: string;

  @IsOptional()
  @IsEnum(ReportSource)
  source?: ReportSource;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasRecording?: boolean;
}

export interface PaginatedReportsResponse {
  items: ReportSummaryResponse[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class CreateCaptureSessionDto {
  @Type(() => Date)
  @IsDate()
  startedAt: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recordingStartedAt?: Date;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  pageUrl?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  referrer?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  browserName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  browserVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  osName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  extensionVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  manifestVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  tabId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  windowId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  viewportWidth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  viewportHeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  screenWidth?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20000)
  screenHeight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(20)
  devicePixelRatio?: number;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class CompleteCaptureSessionDto {
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endedAt?: Date;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  recordingEndedAt?: Date;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(86_400_000)
  durationMs?: number;

  @IsOptional()
  @IsEnum(CaptureSessionStatus)
  status?: CaptureSessionStatus;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export interface ReportUploadResponse {
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

export interface ReportEventResponse {
  id: string;
  kind: string;
  payload?: unknown;
  createdAt: string;
}

export interface CaptureSessionResponse {
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

export interface ConsoleLogResponse {
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

export interface NetworkRequestResponse {
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

export interface PageActionResponse {
  id: string;
  sessionId?: string | null;
  kind: PageActionKind;
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

export interface RuntimeErrorResponse {
  id: string;
  sessionId?: string | null;
  kind: RuntimeErrorKind;
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

export interface PerformanceEntryResponse {
  id: string;
  sessionId?: string | null;
  kind: PerformanceEntryKind;
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

export interface DomEventResponse {
  id: string;
  sessionId?: string | null;
  kind: DomEventKind;
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

export interface BackendTraceResponse {
  id: string;
  sessionId?: string | null;
  traceId?: string | null;
  spanId?: string | null;
  parentSpanId?: string | null;
  serviceName?: string | null;
  operationName: string;
  status: BackendTraceStatus;
  method?: string | null;
  url?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  startedAt: string;
  endedAt?: string | null;
  offsetMs?: number | null;
  metadata?: unknown;
}

export class CreateReportCommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  authorName?: string;

  @IsString()
  @MaxLength(4000)
  body: string;
}

export interface ReportCommentResponse {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReportDetailResponse extends ReportSummaryResponse {
  userAgent?: string | null;
  browserVersion?: string | null;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  metadata?: unknown;
  captureSessions: CaptureSessionResponse[];
  uploads: ReportUploadResponse[];
  events: ReportEventResponse[];
  consoleLogs: ConsoleLogResponse[];
  networkRequests: NetworkRequestResponse[];
  pageActions: PageActionResponse[];
  runtimeErrors: RuntimeErrorResponse[];
  performanceEntries: PerformanceEntryResponse[];
  domEvents: DomEventResponse[];
  backendTraces: BackendTraceResponse[];
  timeline: ReportTimelineEntryResponse[];
  comments: ReportCommentResponse[];
}

export type ReportTimelineEntryType =
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

export interface ReportTimelineEntryResponse {
  id: string;
  type: ReportTimelineEntryType;
  title: string;
  subtitle?: string | null;
  severity: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
  timestamp: string;
  offsetMs?: number | null;
  payload?: unknown;
}
