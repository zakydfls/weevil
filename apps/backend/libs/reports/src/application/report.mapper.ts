import { Injectable } from '@nestjs/common';
import type {
  BackendTraceResponse,
  CaptureSessionResponse,
  ConsoleLogResponse,
  DomEventResponse,
  NetworkRequestResponse,
  PageActionResponse,
  PerformanceEntryResponse,
  ReportCommentResponse,
  ReportDetailResponse,
  ReportEventResponse,
  ReportSummaryResponse,
  ReportTimelineEntryResponse,
  ReportUploadResponse,
  RuntimeErrorResponse,
} from '@weevil/contracts';
import type {
  BackendTraceEntry,
  BugReport,
  CaptureSession,
  ConsoleLogEntry,
  DomEventEntry,
  NetworkRequestEntry,
  PageActionEntry,
  PerformanceEntry,
  ReportComment,
  ReportEvent,
  ReportAssignee,
  ReportUpload,
  RuntimeErrorEntry,
  User,
} from '@weevil/prisma-client';
import { RedactionService } from '@weevil/redaction';

type ReportCountShape = {
  uploads?: number;
  consoleLogs?: number;
  networkRequests?: number;
  comments?: number;
  pageActions?: number;
  runtimeErrors?: number;
  performanceEntries?: number;
  domEvents?: number;
  backendTraces?: number;
};

type ReportSummaryModel = BugReport & {
  uploads?: ReportUpload[];
  createdBy?: ReportReporterModel | null;
  assignees?: ReportAssigneeModel[];
  _count?: ReportCountShape;
};

type ReportDetailModel = BugReport & {
  createdBy?: ReportReporterModel | null;
  assignees?: ReportAssigneeModel[];
  uploads: ReportUpload[];
  events: ReportEvent[];
  consoleLogs: ConsoleLogEntry[];
  networkRequests: NetworkRequestEntry[];
  captureSessions: CaptureSession[];
  pageActions: PageActionEntry[];
  runtimeErrors: RuntimeErrorEntry[];
  performanceEntries: PerformanceEntry[];
  domEvents: DomEventEntry[];
  backendTraces: BackendTraceEntry[];
  comments: ReportComment[];
  _count?: ReportCountShape;
};

type ReportReporterModel = Pick<User, 'id' | 'email' | 'displayName' | 'avatarUrl'>;
type ReportAssigneeModel = ReportAssignee & { user: ReportReporterModel };

interface ReportMapOptions {
  includeAssignees?: boolean;
}

@Injectable()
export class ReportMapper {
  constructor(private readonly redaction: RedactionService) {}

  toSummary(report: ReportSummaryModel, options: ReportMapOptions = {}): ReportSummaryResponse {
    const shouldRedact = this.redaction.shouldRedact(report.metadata);
    const includeAssignees = options.includeAssignees ?? true;

    return {
      id: report.id,
      workspaceId: report.workspaceId,
      projectId: report.projectId,
      title: report.title,
      description: this.redactNullableText(report.description, shouldRedact),
      status: report.status,
      source: report.source,
      shareToken: report.shareToken,
      pageUrl: this.redactNullableText(report.pageUrl, shouldRedact),
      browserName: report.browserName,
      osName: report.osName,
      boardColumn: report.boardColumn,
      boardOrder: report.boardOrder,
      uploadCount: report._count?.uploads,
      consoleLogCount: report._count?.consoleLogs,
      networkRequestCount: report._count?.networkRequests,
      commentCount: report._count?.comments,
      actionCount: report._count?.pageActions,
      runtimeErrorCount: report._count?.runtimeErrors,
      performanceEntryCount: report._count?.performanceEntries,
      domEventCount: report._count?.domEvents,
      backendTraceCount: report._count?.backendTraces,
      reporter: this.toReporter(report.createdBy),
      assignees: includeAssignees ? this.toAssignees(report.assignees) : [],
      primaryRecording: this.findPrimaryRecording(report.uploads),
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  toDetail(report: ReportDetailModel, options: ReportMapOptions = {}): ReportDetailResponse {
    const shouldRedact = this.redaction.shouldRedact(report.metadata);

    return {
      ...this.toSummary(report, options),
      userAgent: report.userAgent,
      browserVersion: report.browserVersion,
      viewportWidth: report.viewportWidth,
      viewportHeight: report.viewportHeight,
      metadata: report.metadata,
      captureSessions: report.captureSessions.map((session) =>
        this.toCaptureSession(session, shouldRedact),
      ),
      uploads: report.uploads.map((upload) => this.toUpload(upload)),
      events: report.events.map((event) => this.toEvent(event)),
      consoleLogs: report.consoleLogs.map((entry) => this.toConsoleLog(entry, shouldRedact)),
      networkRequests: report.networkRequests.map((entry) =>
        this.toNetworkRequest(entry, shouldRedact),
      ),
      pageActions: report.pageActions.map((entry) => this.toPageAction(entry, shouldRedact)),
      runtimeErrors: report.runtimeErrors.map((entry) => this.toRuntimeError(entry, shouldRedact)),
      performanceEntries: report.performanceEntries.map((entry) =>
        this.toPerformanceEntry(entry, shouldRedact),
      ),
      domEvents: report.domEvents.map((entry) => this.toDomEvent(entry, shouldRedact)),
      backendTraces: report.backendTraces.map((entry) => this.toBackendTrace(entry, shouldRedact)),
      timeline: this.toTimeline(report, shouldRedact),
      comments: report.comments.map((comment) => this.toComment(comment, shouldRedact)),
    };
  }

  toUpload(upload: ReportUpload): ReportUploadResponse {
    return {
      id: upload.id,
      kind: upload.kind,
      status: upload.status,
      bucket: upload.bucket,
      objectKey: upload.objectKey,
      contentType: upload.contentType,
      byteSize: upload.byteSize?.toString() ?? null,
      createdAt: upload.createdAt.toISOString(),
      updatedAt: upload.updatedAt.toISOString(),
      completedAt: upload.completedAt?.toISOString() ?? null,
    };
  }

  private findPrimaryRecording(uploads: ReportUpload[] | undefined): ReportUploadResponse | null {
    const recording = uploads?.find((upload) => upload.kind === 'SCREEN_RECORDING');
    return recording ? this.toUpload(recording) : null;
  }

  private toReporter(reporter: ReportReporterModel | null | undefined) {
    if (!reporter) {
      return null;
    }

    return {
      id: reporter.id,
      email: reporter.email,
      displayName: reporter.displayName,
      avatarUrl: reporter.avatarUrl,
    };
  }

  private toAssignees(assignees: ReportAssigneeModel[] | undefined) {
    return (assignees ?? []).map((assignee) => ({
      id: assignee.user.id,
      email: assignee.user.email,
      displayName: assignee.user.displayName,
      avatarUrl: assignee.user.avatarUrl,
      assignedAt: assignee.createdAt.toISOString(),
    }));
  }

  private toEvent(event: ReportEvent): ReportEventResponse {
    return {
      id: event.id,
      kind: event.kind,
      payload: event.payload,
      createdAt: event.createdAt.toISOString(),
    };
  }

  toCaptureSession(session: CaptureSession, shouldRedact = true): CaptureSessionResponse {
    return {
      id: session.id,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      durationMs: session.durationMs,
      recordingStartedAt: session.recordingStartedAt?.toISOString() ?? null,
      recordingEndedAt: session.recordingEndedAt?.toISOString() ?? null,
      pageUrl: this.redactNullableText(session.pageUrl, shouldRedact),
      referrer: this.redactNullableText(session.referrer, shouldRedact),
      title: session.title,
      timezone: session.timezone,
      locale: session.locale,
      userAgent: session.userAgent,
      browserName: session.browserName,
      browserVersion: session.browserVersion,
      osName: session.osName,
      extensionVersion: session.extensionVersion,
      manifestVersion: session.manifestVersion,
      tabId: session.tabId,
      windowId: session.windowId,
      viewportWidth: session.viewportWidth,
      viewportHeight: session.viewportHeight,
      screenWidth: session.screenWidth,
      screenHeight: session.screenHeight,
      devicePixelRatio: session.devicePixelRatio,
      metadata: this.redactUnknownRecord(session.metadata, shouldRedact),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  }

  private toConsoleLog(entry: ConsoleLogEntry, shouldRedact: boolean): ConsoleLogResponse {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      level: entry.level,
      message: entry.message,
      args: this.redactUnknownRecord(entry.args, shouldRedact),
      stack: this.redactNullableText(entry.stack, shouldRedact),
      pageUrl: this.redactNullableText(entry.pageUrl, shouldRedact),
      offsetMs: entry.offsetMs,
      timestamp: entry.timestamp.toISOString(),
    };
  }

  private toNetworkRequest(
    entry: NetworkRequestEntry,
    shouldRedact: boolean,
  ): NetworkRequestResponse {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      requestId: entry.requestId,
      method: entry.method,
      url: this.redactNullableText(entry.url, shouldRedact) ?? entry.url,
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      requestHeaders: this.redactUnknownRecord(entry.requestHeaders, shouldRedact),
      responseHeaders: this.redactUnknownRecord(entry.responseHeaders, shouldRedact),
      requestBody: this.redactNullableText(entry.requestBody, shouldRedact),
      responseBody: this.redactNullableText(entry.responseBody, shouldRedact),
      error: this.redactNullableText(entry.error, shouldRedact),
      resourceType: entry.resourceType,
      offsetMs: entry.offsetMs,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt?.toISOString() ?? null,
    };
  }

  private toPageAction(entry: PageActionEntry, shouldRedact: boolean): PageActionResponse {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      kind: entry.kind,
      selector: this.redactNullableText(entry.selector, shouldRedact),
      nodePath: entry.nodePath,
      label: entry.label,
      tagName: entry.tagName,
      textPreview: this.redactNullableText(entry.textPreview, shouldRedact),
      valuePreview: this.redactNullableText(entry.valuePreview, shouldRedact),
      pageUrl: this.redactNullableText(entry.pageUrl, shouldRedact),
      x: entry.x,
      y: entry.y,
      scrollX: entry.scrollX,
      scrollY: entry.scrollY,
      offsetMs: entry.offsetMs,
      occurredAt: entry.occurredAt.toISOString(),
      metadata: this.redactUnknownRecord(entry.metadata, shouldRedact),
    };
  }

  private toRuntimeError(entry: RuntimeErrorEntry, shouldRedact: boolean): RuntimeErrorResponse {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      kind: entry.kind,
      message: this.redactNullableText(entry.message, shouldRedact) ?? entry.message,
      sourceUrl: this.redactNullableText(entry.sourceUrl, shouldRedact),
      lineNumber: entry.lineNumber,
      columnNumber: entry.columnNumber,
      stack: this.redactNullableText(entry.stack, shouldRedact),
      componentStack: this.redactNullableText(entry.componentStack, shouldRedact),
      pageUrl: this.redactNullableText(entry.pageUrl, shouldRedact),
      offsetMs: entry.offsetMs,
      occurredAt: entry.occurredAt.toISOString(),
      metadata: this.redactUnknownRecord(entry.metadata, shouldRedact),
    };
  }

  private toPerformanceEntry(
    entry: PerformanceEntry,
    shouldRedact: boolean,
  ): PerformanceEntryResponse {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      kind: entry.kind,
      name: entry.name,
      value: entry.value,
      startTimeMs: entry.startTimeMs,
      durationMs: entry.durationMs,
      rating: entry.rating,
      initiatorType: entry.initiatorType,
      pageUrl: this.redactNullableText(entry.pageUrl, shouldRedact),
      offsetMs: entry.offsetMs,
      occurredAt: entry.occurredAt.toISOString(),
      metadata: this.redactUnknownRecord(entry.metadata, shouldRedact),
    };
  }

  private toDomEvent(entry: DomEventEntry, shouldRedact: boolean): DomEventResponse {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      kind: entry.kind,
      selector: this.redactNullableText(entry.selector, shouldRedact),
      nodePath: entry.nodePath,
      mutationType: entry.mutationType,
      previousValue: this.redactNullableText(entry.previousValue, shouldRedact),
      nextValue: this.redactNullableText(entry.nextValue, shouldRedact),
      pageUrl: this.redactNullableText(entry.pageUrl, shouldRedact),
      offsetMs: entry.offsetMs,
      occurredAt: entry.occurredAt.toISOString(),
      attributes: this.redactUnknownRecord(entry.attributes, shouldRedact),
      metadata: this.redactUnknownRecord(entry.metadata, shouldRedact),
    };
  }

  private toBackendTrace(entry: BackendTraceEntry, shouldRedact: boolean): BackendTraceResponse {
    return {
      id: entry.id,
      sessionId: entry.sessionId,
      traceId: entry.traceId,
      spanId: entry.spanId,
      parentSpanId: entry.parentSpanId,
      serviceName: entry.serviceName,
      operationName: entry.operationName,
      status: entry.status,
      method: entry.method,
      url: this.redactNullableText(entry.url, shouldRedact),
      statusCode: entry.statusCode,
      durationMs: entry.durationMs,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt?.toISOString() ?? null,
      offsetMs: entry.offsetMs,
      metadata: this.redactUnknownRecord(entry.metadata, shouldRedact),
    };
  }

  private toTimeline(
    report: ReportDetailModel,
    shouldRedact: boolean,
  ): ReportTimelineEntryResponse[] {
    const timeline: ReportTimelineEntryResponse[] = [
      ...report.captureSessions.map((session) => ({
        id: session.id,
        type: 'SESSION' as const,
        title: `Session ${session.status}`,
        subtitle: this.redactNullableText(session.pageUrl, shouldRedact),
        severity: session.status === 'FAILED' ? ('danger' as const) : ('info' as const),
        timestamp: session.startedAt.toISOString(),
        offsetMs: 0,
        payload: this.toCaptureSession(session, shouldRedact),
      })),
      ...report.uploads.map((upload) => ({
        id: upload.id,
        type: 'UPLOAD' as const,
        title: upload.kind,
        subtitle: upload.status,
        severity: upload.status === 'FAILED' ? ('danger' as const) : ('neutral' as const),
        timestamp: upload.createdAt.toISOString(),
        offsetMs: null,
        payload: this.toUpload(upload),
      })),
      ...report.events.map((event) => ({
        id: event.id,
        type: 'EVENT' as const,
        title: event.kind,
        subtitle: null,
        severity: this.eventSeverity(event.kind),
        timestamp: event.createdAt.toISOString(),
        offsetMs: null,
        payload: this.toEvent(event),
      })),
      ...report.consoleLogs.map((entry) => ({
        id: entry.id,
        type: 'CONSOLE' as const,
        title: entry.level,
        subtitle: this.redactNullableText(entry.message, shouldRedact),
        severity: entry.level === 'ERROR' ? ('danger' as const) : ('neutral' as const),
        timestamp: entry.timestamp.toISOString(),
        offsetMs: entry.offsetMs,
        payload: this.toConsoleLog(entry, shouldRedact),
      })),
      ...report.networkRequests.map((entry) => ({
        id: entry.id,
        type: 'NETWORK' as const,
        title: `${entry.method} ${entry.statusCode ?? ''}`.trim(),
        subtitle: this.redactNullableText(entry.url, shouldRedact),
        severity:
          entry.statusCode && entry.statusCode >= 500
            ? ('danger' as const)
            : entry.statusCode && entry.statusCode >= 400
              ? ('warning' as const)
              : ('neutral' as const),
        timestamp: entry.startedAt.toISOString(),
        offsetMs: entry.offsetMs,
        resourceType: entry.resourceType,
        payload: this.toNetworkRequest(entry, shouldRedact),
      })),
      ...report.pageActions.map((entry) => ({
        id: entry.id,
        type: 'ACTION' as const,
        title: entry.kind,
        subtitle: entry.label ?? entry.selector ?? entry.textPreview,
        severity: 'info' as const,
        timestamp: entry.occurredAt.toISOString(),
        offsetMs: entry.offsetMs,
        payload: this.toPageAction(entry, shouldRedact),
      })),
      ...report.runtimeErrors.map((entry) => ({
        id: entry.id,
        type: 'ERROR' as const,
        title: entry.kind,
        subtitle: this.redactNullableText(entry.message, shouldRedact),
        severity: 'danger' as const,
        timestamp: entry.occurredAt.toISOString(),
        offsetMs: entry.offsetMs,
        payload: this.toRuntimeError(entry, shouldRedact),
      })),
      ...report.performanceEntries.map((entry) => ({
        id: entry.id,
        type: 'PERFORMANCE' as const,
        title: entry.name,
        subtitle: entry.rating ?? entry.kind,
        severity: entry.rating === 'poor' ? ('warning' as const) : ('neutral' as const),
        timestamp: entry.occurredAt.toISOString(),
        offsetMs: entry.offsetMs,
        payload: this.toPerformanceEntry(entry, shouldRedact),
      })),
      ...report.domEvents.map((entry) => ({
        id: entry.id,
        type: 'DOM' as const,
        title: entry.kind,
        subtitle: entry.selector ?? entry.nodePath,
        severity: 'neutral' as const,
        timestamp: entry.occurredAt.toISOString(),
        offsetMs: entry.offsetMs,
        payload: this.toDomEvent(entry, shouldRedact),
      })),
      ...report.backendTraces.map((entry) => ({
        id: entry.id,
        type: 'BACKEND' as const,
        title: entry.operationName,
        subtitle: entry.serviceName ?? entry.url,
        severity: entry.status === 'ERROR' ? ('danger' as const) : ('neutral' as const),
        timestamp: entry.startedAt.toISOString(),
        offsetMs: entry.offsetMs,
        payload: this.toBackendTrace(entry, shouldRedact),
      })),
    ];

    return timeline.sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    );
  }

  private eventSeverity(kind: string): ReportTimelineEntryResponse['severity'] {
    if (kind.includes('FAILED')) {
      return 'danger';
    }

    if (kind.includes('COMPLETED')) {
      return 'success';
    }

    return 'neutral';
  }

  private toComment(comment: ReportComment, shouldRedact: boolean): ReportCommentResponse {
    return {
      id: comment.id,
      authorName: comment.authorName,
      body: this.redactNullableText(comment.body, shouldRedact) ?? comment.body,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  private redactUnknownRecord(value: unknown, shouldRedact: boolean): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return value;
    }

    return shouldRedact ? this.redaction.redactRecord(value as Record<string, unknown>) : value;
  }

  private redactNullableText(
    value: string | null | undefined,
    shouldRedact: boolean,
  ): string | null | undefined {
    return shouldRedact ? (this.redaction.redactText(value ?? undefined) ?? value) : value;
  }
}
