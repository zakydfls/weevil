import { Module } from '@nestjs/common';
import { AuthModule } from '@weevil/auth';
import { RedactionModule } from '@weevil/redaction';
import { ReportTelemetryController } from './presentation/report-telemetry.controller';
import { ReportsController } from './presentation/reports.controller';
import { UploadsController } from './presentation/uploads.controller';
import { ReportMapper } from './application/report.mapper';
import { ReportsService } from './application/reports.service';
import { TenantResolverService } from './application/tenant-resolver.service';
import { TelemetryService } from './application/telemetry.service';
import { UploadsService } from './application/uploads.service';

@Module({
  imports: [RedactionModule, AuthModule],
  controllers: [ReportsController, UploadsController, ReportTelemetryController],
  providers: [
    ReportMapper,
    ReportsService,
    TenantResolverService,
    TelemetryService,
    UploadsService,
  ],
  exports: [ReportsService, UploadsService, TelemetryService],
})
export class ReportsModule {}
