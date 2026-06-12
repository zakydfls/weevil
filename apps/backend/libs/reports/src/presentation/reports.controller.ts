import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
import { CurrentAuth, OptionalAuth, Public } from '@weevil/auth';
import type { AuthContext } from '@weevil/auth';
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

  @Get()
  list(@CurrentAuth() auth: AuthContext, @Query() query: ListReportsQueryDto) {
    return this.reportsService.list(query, { workspaceId: auth.workspace?.id });
  }

  @Get(`:${RouteParams.ReportId}/detail`)
  findDetailById(@CurrentAuth() auth: AuthContext, @Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.findDetailById(reportId, { workspaceId: auth.workspace?.id });
  }

  @Public()
  @Get(ApiRoutes.ReportTimelineRelative)
  timeline(@Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.timeline(reportId);
  }

  @Get(`:${RouteParams.ReportId}`)
  findById(@CurrentAuth() auth: AuthContext, @Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.findById(reportId, { workspaceId: auth.workspace?.id });
  }

  @Patch(`:${RouteParams.ReportId}`)
  update(@Param(RouteParams.ReportId) reportId: string, @Body() dto: UpdateReportDto) {
    return this.reportsService.update(reportId, dto);
  }

  @Post(ApiRoutes.ReportCommentsRelative)
  createComment(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: CreateReportCommentDto,
  ) {
    return this.reportsService.createComment(reportId, dto);
  }

  // Capture sessions and uploads are still extension-driven for now.
  @Public()
  @Post(ApiRoutes.ReportCaptureSessionsRelative)
  createCaptureSession(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: CreateCaptureSessionDto,
  ) {
    return this.reportsService.createCaptureSession(reportId, dto);
  }

  @Public()
  @Post(ApiRoutes.ReportCaptureSessionCompleteRelative)
  completeCaptureSession(
    @Param(RouteParams.ReportId) reportId: string,
    @Param(RouteParams.SessionId) sessionId: string,
    @Body() dto: CompleteCaptureSessionDto,
  ) {
    return this.reportsService.completeCaptureSession(reportId, sessionId, dto);
  }
}
