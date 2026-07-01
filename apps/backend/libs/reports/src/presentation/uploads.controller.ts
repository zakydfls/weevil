import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { ApiRoutes, CompleteUploadDto, CreateUploadDto, RouteParams } from '@weevil/contracts';
import { CurrentAuth, OptionalAuth, Public, RequirePermissions } from '@weevil/auth';
import type { AuthContext } from '@weevil/auth';
import { Permission } from '@weevil/prisma-client';
import { UploadsService } from '../application/uploads.service';

// Upload mutation endpoints are extension-driven. They are public, but guarded
// in the service by the authenticated workspace or x-weevil-report-token.
@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Public()
  @Post(ApiRoutes.ReportUploads)
  create(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: CreateUploadDto,
  ) {
    return this.uploadsService.create(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Public()
  @Post(ApiRoutes.ReportUploadComplete)
  complete(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Param(RouteParams.UploadId) uploadId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.uploadsService.complete(reportId, uploadId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @RequirePermissions(Permission.REPORT_READ_ALL)
  @Get(ApiRoutes.ReportUploadDownloadUrl)
  createDownloadUrl(
    @CurrentAuth() auth: AuthContext,
    @Param(RouteParams.ReportId) reportId: string,
    @Param(RouteParams.UploadId) uploadId: string,
  ) {
    return this.uploadsService.createDownloadUrl(reportId, uploadId, {
      workspaceId: auth.workspace?.id,
    });
  }
}
