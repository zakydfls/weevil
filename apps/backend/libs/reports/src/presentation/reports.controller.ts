import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiRoutes,
  CompleteCaptureSessionDto,
  CreateCaptureSessionDto,
  ListReportsQueryDto,
  CreateReportCommentDto,
  CreateReportDto,
  UpdateReportDto,
  RouteParams,
} from '@weevil/contracts';
import { CurrentAuth, OptionalAuth, Public, RequirePermissions } from '@weevil/auth';
import type { AuthContext } from '@weevil/auth';
import { Permission } from '@weevil/prisma-client';
import { ReportsService } from '../application/reports.service';

@Controller(ApiRoutes.Reports)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /**
   * Public so the extension can post without an API token. AuthGuard still
   * populates `auth` if a session cookie / bearer token is present, so signed-in
   * extension requests land in the user's active workspace. Anonymous requests
   * (no session yet) fall back to the dev tenant.
   */
  @Public()
  @Post()
  create(@OptionalAuth() auth: AuthContext | null, @Body() dto: CreateReportDto) {
    return this.reportsService.create(dto, {
      workspaceId: auth?.workspace?.id,
      createdById: auth?.user?.id,
    });
  }

  @RequirePermissions(Permission.REPORT_READ_ALL)
  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: ListReportsQueryDto) {
    return this.reportsService.list(query, { workspaceId: auth.workspace?.id });
  }

  @Public()
  @Get(ApiRoutes.ReportShareRelative)
  findDetailByShareToken(@Param(RouteParams.ShareToken) shareToken: string) {
    return this.reportsService.findDetailByShareToken(shareToken);
  }

  @RequirePermissions(Permission.REPORT_READ_ALL)
  @Get(`:${RouteParams.ReportId}/detail`)
  findDetailById(@CurrentAuth() auth: AuthContext, @Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.findDetailById(reportId, { workspaceId: auth.workspace?.id });
  }

  @RequirePermissions(Permission.REPORT_READ_ALL)
  @Get(ApiRoutes.ReportTimelineRelative)
  timeline(@CurrentAuth() auth: AuthContext, @Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.timeline(reportId, { workspaceId: auth.workspace?.id });
  }

  @RequirePermissions(Permission.REPORT_READ_ALL)
  @Get(`:${RouteParams.ReportId}`)
  findById(@CurrentAuth() auth: AuthContext, @Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.findById(reportId, { workspaceId: auth.workspace?.id });
  }

  @Public()
  @Patch(`:${RouteParams.ReportId}`)
  update(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.reportsService.update(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      actorUserId: auth?.user.id,
      canUpdateAny: auth?.workspace?.permissions.has(Permission.REPORT_UPDATE_ANY) ?? false,
      canUpdateOwn: auth?.workspace?.permissions.has(Permission.REPORT_UPDATE_OWN) ?? false,
      reportToken,
    });
  }

  @RequirePermissions(Permission.COMMENT_CREATE)
  @Post(ApiRoutes.ReportCommentsRelative)
  createComment(
    @CurrentAuth() auth: AuthContext,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: CreateReportCommentDto,
  ) {
    return this.reportsService.createComment(reportId, dto, {
      authorName: auth.user.displayName ?? auth.user.email,
      actorUserId: auth.user.id,
      workspaceId: auth.workspace?.id,
    });
  }

  // Capture sessions and uploads are still extension-driven for now.
  @Public()
  @Post(ApiRoutes.ReportCaptureSessionsRelative)
  createCaptureSession(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: CreateCaptureSessionDto,
  ) {
    return this.reportsService.createCaptureSession(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Public()
  @Post(ApiRoutes.ReportCaptureSessionCompleteRelative)
  completeCaptureSession(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Param(RouteParams.SessionId) sessionId: string,
    @Body() dto: CompleteCaptureSessionDto,
  ) {
    return this.reportsService.completeCaptureSession(reportId, sessionId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }
}
