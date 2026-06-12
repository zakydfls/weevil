import { Body, Controller, Param, Post } from '@nestjs/common';
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
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachConsoleLogsDto,
  ) {
    return this.telemetryService.attachConsoleLogs(reportId, dto);
  }

  @Post(ApiRoutes.ReportNetworkRequests)
  attachNetworkRequests(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachNetworkRequestsDto,
  ) {
    return this.telemetryService.attachNetworkRequests(reportId, dto);
  }

  @Post(ApiRoutes.ReportPageActions)
  attachPageActions(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachPageActionsDto,
  ) {
    return this.telemetryService.attachPageActions(reportId, dto);
  }

  @Post(ApiRoutes.ReportRuntimeErrors)
  attachRuntimeErrors(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachRuntimeErrorsDto,
  ) {
    return this.telemetryService.attachRuntimeErrors(reportId, dto);
  }

  @Post(ApiRoutes.ReportPerformanceEntries)
  attachPerformanceEntries(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachPerformanceEntriesDto,
  ) {
    return this.telemetryService.attachPerformanceEntries(reportId, dto);
  }

  @Post(ApiRoutes.ReportDomEvents)
  attachDomEvents(@Param(RouteParams.ReportId) reportId: string, @Body() dto: AttachDomEventsDto) {
    return this.telemetryService.attachDomEvents(reportId, dto);
  }

  @Post(ApiRoutes.ReportBackendTraces)
  attachBackendTraces(
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachBackendTracesDto,
  ) {
    return this.telemetryService.attachBackendTraces(reportId, dto);
  }
}
