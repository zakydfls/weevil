import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiRoutes, CompleteUploadDto, CreateUploadDto, RouteParams } from '@weevil/contracts';
import { Public } from '@weevil/auth';
import { UploadsService } from '../application/uploads.service';

// Uploads + downloads are used by the extension (no auth yet) and by the dashboard's
// signed-URL flow. Until the extension carries an API token, leave Public.
@Public()
@Controller()
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post(ApiRoutes.ReportUploads)
  create(@Param(RouteParams.ReportId) reportId: string, @Body() dto: CreateUploadDto) {
    return this.uploadsService.create(reportId, dto);
  }

  @Post(ApiRoutes.ReportUploadComplete)
  complete(
    @Param(RouteParams.ReportId) reportId: string,
    @Param(RouteParams.UploadId) uploadId: string,
    @Body() dto: CompleteUploadDto,
  ) {
    return this.uploadsService.complete(reportId, uploadId, dto);
  }

  @Get(ApiRoutes.ReportUploadDownloadUrl)
  createDownloadUrl(
    @Param(RouteParams.ReportId) reportId: string,
    @Param(RouteParams.UploadId) uploadId: string,
  ) {
    return this.uploadsService.createDownloadUrl(reportId, uploadId);
  }
}
