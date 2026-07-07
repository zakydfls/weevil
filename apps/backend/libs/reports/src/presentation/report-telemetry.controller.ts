import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
import {
  ApiRoutes,
  AttachBackendTracesDto,
  AttachConsoleLogsDto,
  AttachDomEventsDto,
  AttachNetworkRequestsDto,
  AttachPageActionsDto,
  AttachPerformanceEntriesDto,
  AttachRuntimeErrorsDto,
  RouteParams,
} from '@weevil/contracts';
import { Public } from '@weevil/auth';
import { TelemetryService } from '../application/telemetry.service';

// Telemetry ingest is called by the extension on a tight loop. Leave Public until
// the extension is migrated to API tokens.
@Public()
@Controller()
export class ReportTelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post(ApiRoutes.ReportConsoleLogs)
  attachConsoleLogs(
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachConsoleLogsDto,
  ) {
    return this.telemetryService.attachConsoleLogs(reportId, dto, {
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportNetworkRequests)
  attachNetworkRequests(
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachNetworkRequestsDto,
  ) {
    return this.telemetryService.attachNetworkRequests(reportId, dto, {
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportPageActions)
  attachPageActions(
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachPageActionsDto,
  ) {
    return this.telemetryService.attachPageActions(reportId, dto, {
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportRuntimeErrors)
  attachRuntimeErrors(
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachRuntimeErrorsDto,
  ) {
    return this.telemetryService.attachRuntimeErrors(reportId, dto, {
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportPerformanceEntries)
  attachPerformanceEntries(
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachPerformanceEntriesDto,
  ) {
    return this.telemetryService.attachPerformanceEntries(reportId, dto, {
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportDomEvents)
  attachDomEvents(
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachDomEventsDto,
  ) {
    return this.telemetryService.attachDomEvents(reportId, dto, {
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportBackendTraces)
  attachBackendTraces(
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachBackendTracesDto,
  ) {
    return this.telemetryService.attachBackendTraces(reportId, dto, {
      reportToken,
    });
  }
}
