import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  CompleteCaptureSessionDto,
  CreateCaptureSessionDto,
  CreateReportDto,
  CreateReportCommentDto,
  ListReportsQueryDto,
  UpdateReportDto,
  type PaginatedReportsResponse,
  ReportDefaults,
  type CaptureSessionResponse,
  type ReportCommentResponse,
  type ReportDetailResponse,
  type ReportTimelineEntryResponse,
  type ReportSummaryResponse,
} from '@weevil/contracts';
import { PrismaService } from '@weevil/database';
import {
  CaptureSessionStatus,
  Prisma,
  ReportEventKind,
  ReportSource,
  ReportStatus,
} from '@weevil/prisma-client';
import { RedactionService } from '@weevil/redaction';
import { nanoid } from 'nanoid';
import { ReportMapper } from './report.mapper';
import { TenantResolverService } from './tenant-resolver.service';

const reportReporterSelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
} as const;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapper: ReportMapper,
    private readonly redaction: RedactionService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  async create(
    dto: CreateReportDto,
    options: { workspaceId?: string; createdById?: string } = {},
  ): Promise<ReportSummaryResponse> {
    const tenant = options.workspaceId
      ? await this.tenantResolver.resolveForWorkspace(options.workspaceId, dto.projectId)
      : await this.tenantResolver.resolve(dto.projectId);
    const title = dto.title?.trim() || ReportDefaults.UntitledReport;
    const shouldRedact = this.redaction.shouldRedact(dto.metadata);

    const report = await this.prisma.bugReport.create({
      data: {
        workspaceId: tenant.workspaceId,
        projectId: tenant.projectId,
        createdById: options.createdById ?? null,
        title,
        description: this.redactText(dto.description, shouldRedact),
        source: dto.source ?? ReportSource.EXTENSION,
        shareToken: nanoid(ReportDefaults.ShareTokenSize),
        pageUrl: this.redactText(dto.pageUrl, shouldRedact),
        userAgent: dto.userAgent,
        browserName: dto.browserName,
        browserVersion: dto.browserVersion,
        osName: dto.osName,
        viewportWidth: dto.viewportWidth,
        viewportHeight: dto.viewportHeight,
        metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        events: {
          create: {
            kind: ReportEventKind.REPORT_CREATED,
            payload: {
              source: dto.source ?? ReportSource.EXTENSION,
            },
          },
        },
      },
      include: {
        createdBy: {
          select: reportReporterSelect,
        },
      },
    });

    return this.mapper.toSummary(report);
  }

  async findById(
    reportId: string,
    options: { workspaceId?: string } = {},
  ): Promise<ReportSummaryResponse> {
    const report = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      include: {
        createdBy: {
          select: reportReporterSelect,
        },
      },
    });
    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    if (options.workspaceId && report.workspaceId !== options.workspaceId) {
      throw new ForbiddenException('Report belongs to a different workspace.');
    }
    return this.mapper.toSummary(report);
  }

  async update(reportId: string, dto: UpdateReportDto): Promise<ReportSummaryResponse> {
    const current = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { metadata: true },
    });
    const shouldRedact = this.redaction.shouldRedact(current.metadata);
    const report = await this.prisma.bugReport.update({
      where: { id: reportId },
      data: {
        ...(dto.title !== undefined
          ? { title: dto.title.trim() || ReportDefaults.UntitledReport }
          : {}),
        ...(dto.description !== undefined
          ? { description: this.redactText(dto.description, shouldRedact) }
          : {}),
      },
      include: {
        createdBy: {
          select: reportReporterSelect,
        },
      },
    });

    return this.mapper.toSummary(report);
  }

  async list(
    query: ListReportsQueryDto = {},
    options: { workspaceId?: string } = {},
  ): Promise<PaginatedReportsResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 12), 100);
    const search = query.search?.trim();
    const where: Prisma.BugReportWhereInput = {
      deletedAt: null,
      status: { not: ReportStatus.DRAFT },
      source: query.source,
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
      ...(typeof query.hasRecording === 'boolean'
        ? {
            uploads: query.hasRecording
              ? { some: { kind: 'SCREEN_RECORDING' } }
              : { none: { kind: 'SCREEN_RECORDING' } },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { id: { contains: search, mode: 'insensitive' } },
              { title: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
              { pageUrl: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, reports] = await this.prisma.$transaction([
      this.prisma.bugReport.count({ where }),
      this.prisma.bugReport.findMany({
        where,
        include: {
          createdBy: {
            select: reportReporterSelect,
          },
          uploads: {
            where: {
              kind: 'SCREEN_RECORDING',
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: 1,
          },
          _count: {
            select: {
              uploads: true,
              consoleLogs: true,
              networkRequests: true,
              comments: true,
              pageActions: true,
              runtimeErrors: true,
              performanceEntries: true,
              domEvents: true,
              backendTraces: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: reports.map((report) => this.mapper.toSummary(report)),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async findDetailById(
    reportId: string,
    options: { workspaceId?: string } = {},
  ): Promise<ReportDetailResponse> {
    // First, lightweight existence + ownership check — clear errors instead of a 500.
    const reportRow = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      select: { id: true, workspaceId: true },
    });
    if (!reportRow) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    if (options.workspaceId && reportRow.workspaceId !== options.workspaceId) {
      throw new ForbiddenException('Report belongs to a different workspace.');
    }

    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      include: {
        createdBy: {
          select: reportReporterSelect,
        },
        captureSessions: {
          orderBy: { startedAt: 'asc' },
          take: 20,
        },
        uploads: {
          orderBy: { createdAt: 'desc' },
        },
        events: {
          orderBy: { createdAt: 'asc' },
        },
        consoleLogs: {
          orderBy: { timestamp: 'asc' },
          take: 200,
        },
        networkRequests: {
          orderBy: { startedAt: 'asc' },
          take: 200,
        },
        pageActions: {
          orderBy: { occurredAt: 'asc' },
          take: 500,
        },
        runtimeErrors: {
          orderBy: { occurredAt: 'asc' },
          take: 200,
        },
        performanceEntries: {
          orderBy: { occurredAt: 'asc' },
          take: 300,
        },
        domEvents: {
          orderBy: { occurredAt: 'asc' },
          take: 300,
        },
        backendTraces: {
          orderBy: { startedAt: 'asc' },
          take: 300,
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          take: 100,
        },
        _count: {
          select: {
            uploads: true,
            consoleLogs: true,
            networkRequests: true,
            comments: true,
            pageActions: true,
            runtimeErrors: true,
            performanceEntries: true,
            domEvents: true,
            backendTraces: true,
          },
        },
      },
    });

    return this.mapper.toDetail(report);
  }

  async createCaptureSession(
    reportId: string,
    dto: CreateCaptureSessionDto,
  ): Promise<CaptureSessionResponse> {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { id: true, metadata: true },
    });
    const shouldRedact = this.redaction.shouldRedact(report.metadata);

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.captureSession.create({
        data: {
          reportId,
          status: CaptureSessionStatus.STARTED,
          startedAt: dto.startedAt,
          recordingStartedAt: dto.recordingStartedAt,
          pageUrl: this.redactText(dto.pageUrl, shouldRedact),
          referrer: this.redactText(dto.referrer, shouldRedact),
          title: this.redactText(dto.title, shouldRedact),
          timezone: dto.timezone,
          locale: dto.locale,
          userAgent: dto.userAgent,
          browserName: dto.browserName,
          browserVersion: dto.browserVersion,
          osName: dto.osName,
          extensionVersion: dto.extensionVersion,
          manifestVersion: dto.manifestVersion,
          tabId: dto.tabId,
          windowId: dto.windowId,
          viewportWidth: dto.viewportWidth,
          viewportHeight: dto.viewportHeight,
          screenWidth: dto.screenWidth,
          screenHeight: dto.screenHeight,
          devicePixelRatio: dto.devicePixelRatio,
          metadata: this.toJson(this.redactRecord(dto.metadata, shouldRedact)),
        },
      });

      await tx.bugReport.update({
        where: { id: reportId },
        data: {
          pageUrl: this.redactText(dto.pageUrl, shouldRedact),
          userAgent: dto.userAgent,
          browserName: dto.browserName,
          browserVersion: dto.browserVersion,
          osName: dto.osName,
          viewportWidth: dto.viewportWidth,
          viewportHeight: dto.viewportHeight,
        },
      });

      await tx.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.CAPTURE_SESSION_STARTED,
          payload: {
            sessionId: created.id,
          },
        },
      });

      return created;
    });

    return this.mapper.toCaptureSession(session);
  }

  async completeCaptureSession(
    reportId: string,
    sessionId: string,
    dto: CompleteCaptureSessionDto,
  ): Promise<CaptureSessionResponse> {
    const shouldRedact = await this.isReportRedactionEnabled(reportId);
    const session = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.captureSession.update({
        where: {
          id: sessionId,
          reportId,
        },
        data: {
          status: dto.status ?? CaptureSessionStatus.COMPLETED,
          endedAt: dto.endedAt ?? new Date(),
          recordingEndedAt: dto.recordingEndedAt,
          durationMs: dto.durationMs,
          metadata: this.toJson(this.redactRecord(dto.metadata, shouldRedact)),
        },
      });

      await tx.reportEvent.create({
        data: {
          reportId,
          kind: ReportEventKind.CAPTURE_SESSION_COMPLETED,
          payload: {
            sessionId,
            status: updated.status,
            durationMs: updated.durationMs,
          },
        },
      });

      return updated;
    });

    return this.mapper.toCaptureSession(session);
  }

  async timeline(reportId: string): Promise<ReportTimelineEntryResponse[]> {
    const detail = await this.findDetailById(reportId);
    return detail.timeline;
  }

  async createComment(
    reportId: string,
    dto: CreateReportCommentDto,
    options: { authorName?: string | null } = {},
  ): Promise<ReportCommentResponse> {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { id: true, metadata: true },
    });
    const shouldRedact = this.redaction.shouldRedact(report.metadata);

    const comment = await this.prisma.reportComment.create({
      data: {
        reportId,
        authorName: options.authorName?.trim() || dto.authorName?.trim() || 'Weevil User',
        body: this.redactText(dto.body, shouldRedact) ?? dto.body,
      },
    });

    return {
      id: comment.id,
      authorName: comment.authorName,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
    };
  }

  private toJson(value: unknown): Prisma.InputJsonValue | undefined {
    return value as Prisma.InputJsonValue | undefined;
  }

  private async isReportRedactionEnabled(reportId: string): Promise<boolean> {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { metadata: true },
    });

    return this.redaction.shouldRedact(report.metadata);
  }

  private redactText(value: string | undefined, shouldRedact: boolean) {
    return shouldRedact ? this.redaction.redactText(value) : value;
  }

  private redactRecord(value: Record<string, unknown> | undefined, shouldRedact: boolean) {
    return shouldRedact ? this.redaction.redactRecord(value) : value;
  }
}
