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
import { ReportsService } from '../application/reports.service';

@Controller(ApiRoutes.Reports)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(@Body() dto: CreateReportDto) {
    return this.reportsService.create(dto);
  }

  @Get()
  list(@Query() query: ListReportsQueryDto) {
    return this.reportsService.list(query);
  }

  @Get(`:${RouteParams.ReportId}/detail`)
  findDetailById(@Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.findDetailById(reportId);
  }

  @Get(ApiRoutes.ReportTimelineRelative)
  timeline(@Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.timeline(reportId);
  }

  @Get(`:${RouteParams.ReportId}`)
  findById(@Param(RouteParams.ReportId) reportId: string) {
    return this.reportsService.findById(reportId);
  }

  @Patch(`:${RouteParams.ReportId}`)
  update(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: UpdateReportDto,
  ) {
    return this.reportsService.update(reportId, dto);
  }

  @Post(ApiRoutes.ReportCommentsRelative)
  createComment(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: CreateReportCommentDto,
  ) {
    return this.reportsService.createComment(reportId, dto);
  }

  @Post(ApiRoutes.ReportCaptureSessionsRelative)
  createCaptureSession(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: CreateCaptureSessionDto,
  ) {
    return this.reportsService.createCaptureSession(reportId, dto);
  }

  @Post(ApiRoutes.ReportCaptureSessionCompleteRelative)
  completeCaptureSession(
    @Param(RouteParams.ReportId) reportId: string,
    @Param(RouteParams.SessionId) sessionId: string,
    @Body() dto: CompleteCaptureSessionDto,
  ) {
    return this.reportsService.completeCaptureSession(reportId, sessionId, dto);
  }
}
