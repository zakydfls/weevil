import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CompleteCaptureSessionDto,
  CreateCaptureSessionDto,
  CreateReportBoardColumnDto,
  CreateReportDto,
  CreateReportCommentDto,
  ListReportsQueryDto,
  UpdateReportAssigneesDto,
  UpdateReportBoardDto,
  UpdateReportDto,
  type PaginatedReportsResponse,
  ReportDefaults,
  type CaptureSessionResponse,
  type ReportCommentResponse,
  type ReportDetailResponse,
  type ReportTimelineEntryResponse,
  type ReportBoardColumnResponse,
  type ReportSummaryResponse,
} from '@weevil/contracts';
import { PrismaService } from '@weevil/database';
import {
  CaptureSessionStatus,
  MembershipStatus,
  Prisma,
  ReportEventKind,
  ReportSource,
  ReportStatus,
  UserStatus,
} from '@weevil/prisma-client';
import { RedactionService } from '@weevil/redaction';
import { nanoid } from 'nanoid';
import {
  ReportEvents,
  type ReportAssigneesChangedEvent,
  type ReportCaptureCreatedEvent,
  type ReportCommentCreatedEvent,
} from '../domain/report-events';
import {
  assertReportAccess,
  assertReportTokenAccess,
  assertWorkspaceAccess,
  hasReportTokenAccess,
  requireWorkspaceId,
  type ReportAccessOptions,
} from './report-access';
import { ReportMapper } from './report.mapper';
import { TenantResolverService } from './tenant-resolver.service';

const reportReporterSelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
} as const;

const reportAssigneesInclude = {
  orderBy: { createdAt: 'asc' },
  include: {
    user: {
      select: reportReporterSelect,
    },
  },
} as const;

const DEFAULT_REPORT_BOARD_COLUMNS = [
  {
    key: 'backlog',
    title: 'Backlog',
    description: 'Fresh captures land here until someone triages them.',
    color: 'cool',
    order: 1000,
  },
  {
    key: 'in-progress',
    title: 'In progress',
    description: 'Actively being investigated or fixed.',
    color: 'primary',
    order: 2000,
  },
  {
    key: 'review',
    title: 'Review',
    description: 'Needs QA, product, or engineering confirmation.',
    color: 'warning',
    order: 3000,
  },
  {
    key: 'done',
    title: 'Done',
    description: 'Resolved and verified.',
    color: 'success',
    order: 4000,
  },
] as const;

const BOARD_COLUMN_COLORS = new Set(['cool', 'primary', 'warning', 'success', 'danger', 'neutral']);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly mapper: ReportMapper,
    private readonly redaction: RedactionService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  async create(
    dto: CreateReportDto,
    options: { workspaceId?: string; createdById?: string; canCreate?: boolean } = {},
  ): Promise<ReportSummaryResponse & { ingestToken: string }> {
    if (options.workspaceId && !options.canCreate) {
      throw new ForbiddenException('Missing permission to create reports.');
    }
    const tenant = options.workspaceId
      ? await this.tenantResolver.resolveForWorkspace(options.workspaceId, dto.projectId)
      : await this.tenantResolver.resolve();
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
        ingestToken: nanoid(ReportDefaults.ShareTokenSize),
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
        assignees: reportAssigneesInclude,
      },
    });

    return { ...this.mapper.toSummary(report), ingestToken: report.ingestToken! };
  }

  async findById(
    reportId: string,
    options: { workspaceId?: string } = {},
  ): Promise<ReportSummaryResponse> {
    const workspaceId = requireWorkspaceId(options.workspaceId);
    const report = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      include: {
        createdBy: {
          select: reportReporterSelect,
        },
        assignees: reportAssigneesInclude,
      },
    });
    if (!report || report.deletedAt) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    assertWorkspaceAccess(report, workspaceId);
    return this.mapper.toSummary(report);
  }

  async update(
    reportId: string,
    dto: UpdateReportDto,
    options: ReportAccessOptions & {
      actorUserId?: string;
      canUpdateAny?: boolean;
      canUpdateOwn?: boolean;
    } = {},
  ): Promise<ReportSummaryResponse> {
    const current = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      select: {
        metadata: true,
        workspaceId: true,
        shareToken: true,
        ingestToken: true,
        createdById: true,
        deletedAt: true,
      },
    });
    if (!current || current.deletedAt) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    assertReportAccess(current, options);
    const hasIngestToken = hasReportTokenAccess(current, options.reportToken);
    if (
      !hasIngestToken &&
      options.workspaceId &&
      !options.canUpdateAny &&
      !(options.canUpdateOwn && current.createdById === options.actorUserId)
    ) {
      throw new ForbiddenException('Missing permission to update this report.');
    }

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
        assignees: reportAssigneesInclude,
      },
    });

    return this.mapper.toSummary(report);
  }

  async softDelete(
    reportId: string,
    options: {
      workspaceId?: string;
      actorUserId?: string;
      canDeleteAny?: boolean;
      canDeleteOwn?: boolean;
    } = {},
  ): Promise<void> {
    const current = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      select: {
        workspaceId: true,
        createdById: true,
        deletedAt: true,
      },
    });
    if (!current || current.deletedAt) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    assertWorkspaceAccess(current, options.workspaceId);
    if (
      !options.canDeleteAny &&
      !(options.canDeleteOwn && current.createdById === options.actorUserId)
    ) {
      throw new ForbiddenException('Missing permission to delete this report.');
    }

    await this.prisma.bugReport.update({
      where: { id: reportId },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async moveOnBoard(
    reportId: string,
    dto: UpdateReportBoardDto,
    options: { workspaceId?: string } = {},
  ): Promise<ReportSummaryResponse> {
    const workspaceId = requireWorkspaceId(options.workspaceId);
    const boardColumn = normalizeBoardColumn(dto.boardColumn);
    await this.ensureDefaultBoardColumns(workspaceId);

    const report = await this.prisma.$transaction(async (tx) => {
      const current = await tx.bugReport.findUnique({
        where: { id: reportId },
        select: {
          id: true,
          workspaceId: true,
          deletedAt: true,
        },
      });
      if (!current || current.deletedAt) {
        throw new NotFoundException(`Report ${reportId} not found.`);
      }
      assertWorkspaceAccess(current, workspaceId);

      const destinationColumn = await tx.reportBoardColumn.findUnique({
        where: {
          workspaceId_key: {
            workspaceId,
            key: boardColumn,
          },
        },
        select: { id: true },
      });
      if (!destinationColumn) {
        throw new BadRequestException('Board column not found.');
      }

      const siblings = await tx.bugReport.findMany({
        where: {
          workspaceId,
          deletedAt: null,
          status: { not: ReportStatus.DRAFT },
          boardColumn,
          id: { not: reportId },
        },
        select: { id: true },
        orderBy: [{ boardOrder: 'asc' }, { createdAt: 'desc' }],
      });
      const nextIds = siblings.map((sibling) => sibling.id);
      const targetIndex = clampBoardIndex(dto.targetIndex, nextIds.length);
      nextIds.splice(targetIndex, 0, reportId);

      await Promise.all(
        nextIds.map((id, index) =>
          tx.bugReport.update({
            where: { id },
            data: {
              boardColumn,
              boardOrder: (index + 1) * 1000,
            },
          }),
        ),
      );

      return tx.bugReport.findUniqueOrThrow({
        where: { id: reportId },
        include: {
          createdBy: {
            select: reportReporterSelect,
          },
          assignees: reportAssigneesInclude,
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
      });
    });

    return this.mapper.toSummary(report);
  }

  async listBoardColumns(options: { workspaceId?: string } = {}): Promise<ReportBoardColumnResponse[]> {
    const workspaceId = requireWorkspaceId(options.workspaceId);
    await this.ensureDefaultBoardColumns(workspaceId);

    const columns = await this.prisma.reportBoardColumn.findMany({
      where: { workspaceId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    return columns.map(toBoardColumnResponse);
  }

  async createBoardColumn(
    dto: CreateReportBoardColumnDto,
    options: { workspaceId?: string } = {},
  ): Promise<ReportBoardColumnResponse> {
    const workspaceId = requireWorkspaceId(options.workspaceId);
    await this.ensureDefaultBoardColumns(workspaceId);

    const title = normalizeBoardColumnTitle(dto.title);
    const description = normalizeOptionalBoardColumnText(dto.description);
    const key = await this.nextBoardColumnKey(workspaceId, normalizeBoardColumn(title));
    const color = BOARD_COLUMN_COLORS.has(dto.color ?? '') ? dto.color! : 'primary';
    const maxOrder = await this.prisma.reportBoardColumn.aggregate({
      where: { workspaceId },
      _max: { order: true },
    });

    const column = await this.prisma.reportBoardColumn.create({
      data: {
        workspaceId,
        key,
        title,
        description,
        color,
        order: (maxOrder._max.order ?? 0) + 1000,
      },
    });

    return toBoardColumnResponse(column);
  }

  async setAssignees(
    reportId: string,
    dto: UpdateReportAssigneesDto,
    options: {
      workspaceId?: string;
      actorUserId?: string;
      canUpdateAny?: boolean;
      canUpdateOwn?: boolean;
    } = {},
  ): Promise<ReportSummaryResponse> {
    const workspaceId = requireWorkspaceId(options.workspaceId);
    const current = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      select: {
        id: true,
        workspaceId: true,
        createdById: true,
        deletedAt: true,
      },
    });
    if (!current || current.deletedAt) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    assertWorkspaceAccess(current, workspaceId);
    if (
      !options.canUpdateAny &&
      !(options.canUpdateOwn && current.createdById === options.actorUserId)
    ) {
      throw new ForbiddenException('Missing permission to update this report.');
    }

    const assigneeUserIds = normalizeAssigneeUserIds(dto.assigneeUserIds);
    await this.assertAssignableMembers(workspaceId, assigneeUserIds);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reportAssignee.findMany({
        where: { reportId },
        select: { userId: true },
      });
      const existingUserIds = new Set(existing.map((assignee) => assignee.userId));
      const nextUserIds = new Set(assigneeUserIds);
      const removedUserIds = existing
        .map((assignee) => assignee.userId)
        .filter((userId) => !nextUserIds.has(userId));
      const addedUserIds = assigneeUserIds.filter((userId) => !existingUserIds.has(userId));

      if (removedUserIds.length > 0) {
        await tx.reportAssignee.deleteMany({
          where: {
            reportId,
            userId: { in: removedUserIds },
          },
        });
      }

      if (addedUserIds.length > 0) {
        await tx.reportAssignee.createMany({
          data: addedUserIds.map((userId) => ({
            reportId,
            workspaceId,
            userId,
            assignedById: options.actorUserId ?? null,
          })),
          skipDuplicates: true,
        });
      }

      const report = await tx.bugReport.findUniqueOrThrow({
        where: { id: reportId },
        include: {
          createdBy: {
            select: reportReporterSelect,
          },
          assignees: reportAssigneesInclude,
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
      });

      return { report, addedUserIds };
    });

    if (result.addedUserIds.length > 0) {
      this.eventEmitter.emit(ReportEvents.AssigneesChanged, {
        reportId,
        actorUserId: options.actorUserId,
        addedUserIds: result.addedUserIds,
      } satisfies ReportAssigneesChangedEvent);
    }

    return this.mapper.toSummary(result.report);
  }

  async list(
    query: ListReportsQueryDto = {},
    options: { workspaceId?: string } = {},
  ): Promise<PaginatedReportsResponse> {
    const workspaceId = requireWorkspaceId(options.workspaceId);
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(Math.max(1, query.pageSize ?? 12), 100);
    const search = query.search?.trim();
    const where: Prisma.BugReportWhereInput = {
      deletedAt: null,
      status: { not: ReportStatus.DRAFT },
      source: query.source,
      workspaceId,
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
          assignees: reportAssigneesInclude,
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
    const workspaceId = requireWorkspaceId(options.workspaceId);
    // First, lightweight existence + ownership check — clear errors instead of a 500.
    const reportRow = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      select: { id: true, workspaceId: true, deletedAt: true },
    });
    if (!reportRow || reportRow.deletedAt) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    assertWorkspaceAccess(reportRow, workspaceId);

    return this.loadDetail(reportId);
  }

  async findDetailByShareToken(shareToken: string): Promise<ReportDetailResponse> {
    const reportRow = await this.prisma.bugReport.findUnique({
      where: { shareToken },
      select: { id: true, deletedAt: true },
    });
    if (!reportRow || reportRow.deletedAt) {
      throw new NotFoundException('Shared capture not found.');
    }

    return this.loadDetail(reportRow.id, { includeAssignees: false });
  }

  private async loadDetail(
    reportId: string,
    options: { includeAssignees?: boolean } = {},
  ): Promise<ReportDetailResponse> {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      include: {
        createdBy: {
          select: reportReporterSelect,
        },
        assignees: reportAssigneesInclude,
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

    return this.mapper.toDetail(report, { includeAssignees: options.includeAssignees });
  }

  async createCaptureSession(
    reportId: string,
    dto: CreateCaptureSessionDto,
    options: ReportAccessOptions = {},
  ): Promise<CaptureSessionResponse> {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { id: true, metadata: true, workspaceId: true, shareToken: true, ingestToken: true },
    });
    assertReportTokenAccess(report, options.reportToken);
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
    options: ReportAccessOptions = {},
  ): Promise<CaptureSessionResponse> {
    const shouldRedact = await this.isReportRedactionEnabled(reportId, options);
    const result = await this.prisma.$transaction(async (tx) => {
      const current = await tx.captureSession.findUniqueOrThrow({
        where: {
          id: sessionId,
          reportId,
        },
        select: {
          status: true,
        },
      });
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

      return {
        session: updated,
        shouldNotifyCaptureCreated:
          updated.status === CaptureSessionStatus.COMPLETED &&
          current.status !== CaptureSessionStatus.COMPLETED,
      };
    });

    if (result.shouldNotifyCaptureCreated) {
      this.eventEmitter.emit(ReportEvents.CaptureCreated, {
        reportId,
      } satisfies ReportCaptureCreatedEvent);
    }

    return this.mapper.toCaptureSession(result.session);
  }

  async timeline(
    reportId: string,
    options: { workspaceId?: string } = {},
  ): Promise<ReportTimelineEntryResponse[]> {
    const detail = await this.findDetailById(reportId, options);
    return detail.timeline;
  }

  async createComment(
    reportId: string,
    dto: CreateReportCommentDto,
    options: { actorUserId?: string | null; authorName?: string | null; workspaceId?: string } = {},
  ): Promise<ReportCommentResponse> {
    const report = await this.prisma.bugReport.findUnique({
      where: { id: reportId },
      select: { id: true, metadata: true, workspaceId: true },
    });
    if (!report) {
      throw new NotFoundException(`Report ${reportId} not found.`);
    }
    assertWorkspaceAccess(report, options.workspaceId);
    const shouldRedact = this.redaction.shouldRedact(report.metadata);

    const comment = await this.prisma.reportComment.create({
      data: {
        reportId,
        authorName: options.authorName?.trim() || dto.authorName?.trim() || 'Weevil User',
        body: this.redactText(dto.body, shouldRedact) ?? dto.body,
      },
    });

    this.eventEmitter.emit(ReportEvents.CommentCreated, {
      reportId,
      actorUserId: options.actorUserId,
      authorName: comment.authorName,
      body: comment.body,
    } satisfies ReportCommentCreatedEvent);

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

  private async isReportRedactionEnabled(
    reportId: string,
    options: ReportAccessOptions = {},
  ): Promise<boolean> {
    const report = await this.prisma.bugReport.findUniqueOrThrow({
      where: { id: reportId },
      select: { metadata: true, workspaceId: true, shareToken: true, ingestToken: true },
    });
    assertReportTokenAccess(report, options.reportToken);

    return this.redaction.shouldRedact(report.metadata);
  }

  private redactText(value: string | undefined, shouldRedact: boolean) {
    return shouldRedact ? this.redaction.redactText(value) : value;
  }

  private redactRecord(value: Record<string, unknown> | undefined, shouldRedact: boolean) {
    return shouldRedact ? this.redaction.redactRecord(value) : value;
  }

  private async assertAssignableMembers(workspaceId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;

    const members = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { in: userIds },
        status: MembershipStatus.ACTIVE,
        user: {
          status: UserStatus.ACTIVE,
        },
      },
      select: {
        userId: true,
      },
    });
    const activeUserIds = new Set(members.map((member) => member.userId));
    const invalidUserIds = userIds.filter((userId) => !activeUserIds.has(userId));
    if (invalidUserIds.length > 0) {
      throw new BadRequestException('Assignees must be active members of this workspace.');
    }
  }

  private async ensureDefaultBoardColumns(workspaceId: string): Promise<void> {
    await this.prisma.reportBoardColumn.createMany({
      data: DEFAULT_REPORT_BOARD_COLUMNS.map((column) => ({
        workspaceId,
        key: column.key,
        title: column.title,
        description: column.description,
        color: column.color,
        order: column.order,
      })),
      skipDuplicates: true,
    });
  }

  private async nextBoardColumnKey(workspaceId: string, baseKey: string): Promise<string> {
    const existing = await this.prisma.reportBoardColumn.findMany({
      where: {
        workspaceId,
        key: {
          startsWith: baseKey,
        },
      },
      select: { key: true },
    });
    const keys = new Set(existing.map((column) => column.key));
    if (!keys.has(baseKey)) return baseKey;

    for (let index = 2; index <= 100; index += 1) {
      const key = `${baseKey}-${index}`;
      if (!keys.has(key)) return key;
    }

    throw new BadRequestException('Too many board columns with a similar name.');
  }
}

function normalizeAssigneeUserIds(values: string[] | undefined): string[] {
  const unique = Array.from(
    new Set((values ?? []).map((value) => value.trim()).filter(Boolean)),
  );
  if (unique.length > 20) {
    throw new BadRequestException('A capture can have at most 20 assignees.');
  }
  return unique;
}

function normalizeBoardColumn(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return normalized || 'backlog';
}

function normalizeBoardColumnTitle(value: string | undefined): string {
  const title = (value ?? '').trim().replace(/\s+/g, ' ');
  if (!title) {
    throw new BadRequestException('Board column title is required.');
  }
  return title.slice(0, 80);
}

function normalizeOptionalBoardColumnText(value: string | undefined): string | null {
  const text = (value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, 160) : null;
}

function toBoardColumnResponse(column: {
  id: string;
  key: string;
  title: string;
  description: string | null;
  color: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}): ReportBoardColumnResponse {
  return {
    id: column.id,
    key: column.key,
    title: column.title,
    description: column.description,
    color: column.color,
    order: column.order,
    createdAt: column.createdAt.toISOString(),
    updatedAt: column.updatedAt.toISOString(),
  };
}

function clampBoardIndex(value: number | undefined, max: number): number {
  if (!Number.isFinite(value)) return max;
  return Math.min(Math.max(Math.floor(value ?? max), 0), max);
}
