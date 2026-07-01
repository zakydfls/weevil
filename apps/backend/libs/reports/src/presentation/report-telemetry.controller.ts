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
import { OptionalAuth, Public } from '@weevil/auth';
import type { AuthContext } from '@weevil/auth';
import { TelemetryService } from '../application/telemetry.service';

// Telemetry ingest is called by the extension on a tight loop. Leave Public until
// the extension is migrated to API tokens.
@Public()
@Controller()
export class ReportTelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Post(ApiRoutes.ReportConsoleLogs)
  attachConsoleLogs(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachConsoleLogsDto,
  ) {
    return this.telemetryService.attachConsoleLogs(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportNetworkRequests)
  attachNetworkRequests(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachNetworkRequestsDto,
  ) {
    return this.telemetryService.attachNetworkRequests(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportPageActions)
  attachPageActions(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachPageActionsDto,
  ) {
    return this.telemetryService.attachPageActions(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportRuntimeErrors)
  attachRuntimeErrors(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachRuntimeErrorsDto,
  ) {
    return this.telemetryService.attachRuntimeErrors(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportPerformanceEntries)
  attachPerformanceEntries(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachPerformanceEntriesDto,
  ) {
    return this.telemetryService.attachPerformanceEntries(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportDomEvents)
  attachDomEvents(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachDomEventsDto,
  ) {
    return this.telemetryService.attachDomEvents(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }

  @Post(ApiRoutes.ReportBackendTraces)
  attachBackendTraces(
    @OptionalAuth() auth: AuthContext | null,
    @Headers('x-weevil-report-token') reportToken: string | undefined,
    @Param(RouteParams.ReportId) reportId: string,
    @Body() dto: AttachBackendTracesDto,
  ) {
    return this.telemetryService.attachBackendTraces(reportId, dto, {
      workspaceId: auth?.workspace?.id,
      reportToken,
    });
  }
}
