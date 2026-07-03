import { Injectable } from '@nestjs/common';
import {
  AttachBackendTracesDto,
  AttachConsoleLogsDto,
  AttachDomEventsDto,
  AttachNetworkRequestsDto,
  AttachPageActionsDto,
  AttachPerformanceEntriesDto,
  AttachRuntimeErrorsDto,
} from '@weevil/contracts';
import { PrismaService } from '@weevil/database';
import {
  BackendTraceStatus,
  Prisma,
  ReportEventKind,
} from '@weevil/prisma-client';
import { RedactionService } from '@weevil/redaction';
import { assertReportAccess, type ReportAccessOptions } from './report-access';

@Injectable()
export class TelemetryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redaction: RedactionService,
  ) {}

  async attachConsoleLogs(
    reportId: string,
    dto: AttachConsoleLogsDto,
    options: ReportAccessOptions = {},
  ): Promise<number> {
    if (dto.entries.length === 0) {
      return 0;
    }
    const { redactRecord, redactText } = await this.getRedactors(reportId, options);

    await this.prisma.$transaction([
      this.prisma.consoleLogEntry.createMany({
        data: dto.entries.map((entry) => ({
          reportId,
          sessionId: entry.sessionId,
          level: entry.level,
          message: redactText(entry.message) ?? entry.message,
          args: redactRecord(entry.args),
          stack: redactText(entry.stack),
          pageUrl: redactText(entry.pageUrl),
          offsetMs: entry.offsetMs,
          timestamp: entry.timestamp,
        })),
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.CONSOLE_LOGS_ATTACHED,
          payload: {
            count: dto.entries.length,
          },
        },
      }),
    ]);

    return dto.entries.length;
  }

  async attachNetworkRequests(
    reportId: string,
    dto: AttachNetworkRequestsDto,
    options: ReportAccessOptions = {},
  ): Promise<number> {
    if (dto.entries.length === 0) {
      return 0;
    }
    const { redactRecord, redactText } = await this.getRedactors(reportId, options);

    await this.prisma.$transaction([
      this.prisma.networkRequestEntry.createMany({
        data: dto.entries.map((entry) => ({
          reportId,
          sessionId: entry.sessionId,
          requestId: entry.requestId,
          method: entry.method.toUpperCase(),
          url: redactText(entry.url) ?? entry.url,
          statusCode: entry.statusCode,
          durationMs: entry.durationMs,
          requestHeaders: redactRecord(entry.requestHeaders),
          responseHeaders: redactRecord(entry.responseHeaders),
          requestBody: redactText(entry.requestBody),
          responseBody: redactText(entry.responseBody),
          error: redactText(entry.error),
          offsetMs: entry.offsetMs,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
        })),
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.NETWORK_LOGS_ATTACHED,
          payload: {
            count: dto.entries.length,
          },
        },
      }),
    ]);

    return dto.entries.length;
  }

  async attachPageActions(
    reportId: string,
    dto: AttachPageActionsDto,
    options: ReportAccessOptions = {},
  ): Promise<number> {
    if (dto.entries.length === 0) {
      return 0;
    }
    const { redactRecord, redactText } = await this.getRedactors(reportId, options);

    await this.prisma.$transaction([
      this.prisma.pageActionEntry.createMany({
        data: dto.entries.map((entry) => ({
          reportId,
          sessionId: entry.sessionId,
          kind: entry.kind,
          selector: redactText(entry.selector),
          nodePath: entry.nodePath,
          label: redactText(entry.label),
          tagName: entry.tagName,
          textPreview: redactText(entry.textPreview),
          valuePreview: redactText(entry.valuePreview),
          pageUrl: redactText(entry.pageUrl),
          x: entry.x,
          y: entry.y,
          scrollX: entry.scrollX,
          scrollY: entry.scrollY,
          offsetMs: entry.offsetMs,
          occurredAt: entry.occurredAt,
          metadata: this.toJson(redactRecord(entry.metadata)),
        })),
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.ACTIONS_ATTACHED,
          payload: {
            count: dto.entries.length,
          },
        },
      }),
    ]);

    return dto.entries.length;
  }

  async attachRuntimeErrors(
    reportId: string,
    dto: AttachRuntimeErrorsDto,
    options: ReportAccessOptions = {},
  ): Promise<number> {
    if (dto.entries.length === 0) {
      return 0;
    }
    const { redactRecord, redactText } = await this.getRedactors(reportId, options);

    await this.prisma.$transaction([
      this.prisma.runtimeErrorEntry.createMany({
        data: dto.entries.map((entry) => ({
          reportId,
          sessionId: entry.sessionId,
          kind: entry.kind,
          message: redactText(entry.message) ?? entry.message,
          sourceUrl: redactText(entry.sourceUrl),
          lineNumber: entry.lineNumber,
          columnNumber: entry.columnNumber,
          stack: redactText(entry.stack),
          componentStack: redactText(entry.componentStack),
          pageUrl: redactText(entry.pageUrl),
          offsetMs: entry.offsetMs,
          occurredAt: entry.occurredAt,
          metadata: this.toJson(redactRecord(entry.metadata)),
        })),
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.RUNTIME_ERRORS_ATTACHED,
          payload: {
            count: dto.entries.length,
          },
        },
      }),
    ]);

    return dto.entries.length;
  }

  async attachPerformanceEntries(
    reportId: string,
    dto: AttachPerformanceEntriesDto,
    options: ReportAccessOptions = {},
  ): Promise<number> {
    if (dto.entries.length === 0) {
      return 0;
    }
    const { redactRecord, redactText } = await this.getRedactors(reportId, options);

    await this.prisma.$transaction([
      this.prisma.performanceEntry.createMany({
        data: dto.entries.map((entry) => ({
          reportId,
          sessionId: entry.sessionId,
          kind: entry.kind,
          name: entry.name,
          value: entry.value,
          startTimeMs: entry.startTimeMs,
          durationMs: entry.durationMs,
          rating: entry.rating,
          initiatorType: entry.initiatorType,
          pageUrl: redactText(entry.pageUrl),
          offsetMs: entry.offsetMs,
          occurredAt: entry.occurredAt,
          metadata: this.toJson(redactRecord(entry.metadata)),
        })),
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.PERFORMANCE_ENTRIES_ATTACHED,
          payload: {
            count: dto.entries.length,
          },
        },
      }),
    ]);

    return dto.entries.length;
  }

  async attachDomEvents(
    reportId: string,
    dto: AttachDomEventsDto,
    options: ReportAccessOptions = {},
  ): Promise<number> {
    if (dto.entries.length === 0) {
      return 0;
    }
    const { redactRecord, redactText } = await this.getRedactors(reportId, options);

    await this.prisma.$transaction([
      this.prisma.domEventEntry.createMany({
        data: dto.entries.map((entry) => ({
          reportId,
          sessionId: entry.sessionId,
          kind: entry.kind,
          selector: redactText(entry.selector),
          nodePath: entry.nodePath,
          mutationType: entry.mutationType,
          previousValue: redactText(entry.previousValue),
          nextValue: redactText(entry.nextValue),
          pageUrl: redactText(entry.pageUrl),
          offsetMs: entry.offsetMs,
          occurredAt: entry.occurredAt,
          attributes: this.toJson(redactRecord(entry.attributes)),
          metadata: this.toJson(redactRecord(entry.metadata)),
        })),
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.DOM_EVENTS_ATTACHED,
          payload: {
            count: dto.entries.length,
          },
        },
      }),
    ]);

    return dto.entries.length;
  }

  async attachBackendTraces(
    reportId: string,
    dto: AttachBackendTracesDto,
    options: ReportAccessOptions = {},
  ): Promise<number> {
    if (dto.entries.length === 0) {
      return 0;
    }
    const { redactRecord, redactText } = await this.getRedactors(reportId, options);

    await this.prisma.$transaction([
      this.prisma.backendTraceEntry.createMany({
        data: dto.entries.map((entry) => ({
          reportId,
          sessionId: entry.sessionId,
          traceId: entry.traceId,
          spanId: entry.spanId,
          parentSpanId: entry.parentSpanId,
          serviceName: entry.serviceName,
          operationName: entry.operationName,
          status: entry.status ?? BackendTraceStatus.UNKNOWN,
          method: entry.method?.toUpperCase(),
          url: redactText(entry.url),
          statusCode: entry.statusCode,
          durationMs: entry.durationMs,
          startedAt: entry.startedAt,
          endedAt: entry.endedAt,
          offsetMs: entry.offsetMs,
          metadata: this.toJson(redactRecord(entry.metadata)),
        })),
      }),
      this.prisma.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.BACKEND_TRACES_ATTACHED,
          payload: {
            count: dto.entries.length,
          },
        },
      }),
    ]);

    return dto.entries.length;
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private async getRedactors(reportId: string, options: ReportAccessOptions) {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { metadata: true, workspaceId: true, shareToken: true, ingestToken: true },
    });
    assertReportAccess(report, options);
    const shouldRedact = this.redaction.shouldRedact(report.metadata);

    return {
      redactText: (value: string | undefined) =>
        shouldRedact ? this.redaction.redactText(value) : value,
      redactRecord: (value: Record<string, unknown> | undefined) =>
        this.toJson(shouldRedact ? this.redaction.redactRecord(value) : value),
    };
  }
}
