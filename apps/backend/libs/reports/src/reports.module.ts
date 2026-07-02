import { Module } from '@nestjs/common';
import { AuthModule } from '@weevil/auth';
import { AppConfigModule } from '@weevil/config';
import { NotificationsModule } from '@weevil/notifications';
import { RedactionModule } from '@weevil/redaction';
import { ReportNotificationService } from './application/report-notification.service';
import { ReportTelemetryController } from './presentation/report-telemetry.controller';
import { ReportsController } from './presentation/reports.controller';
import { UploadsController } from './presentation/uploads.controller';
import { ReportMapper } from './application/report.mapper';
import { ReportsService } from './application/reports.service';
import { TenantResolverService } from './application/tenant-resolver.service';
import { TelemetryService } from './application/telemetry.service';
import { UploadsService } from './application/uploads.service';

@Module({
  imports: [AppConfigModule, RedactionModule, AuthModule, NotificationsModule],
  controllers: [ReportsController, UploadsController, ReportTelemetryController],
  providers: [
    ReportMapper,
    ReportNotificationService,
    ReportsService,
    TenantResolverService,
    TelemetryService,
    UploadsService,
  ],
  exports: [ReportNotificationService, ReportsService, UploadsService, TelemetryService],
})
export class ReportsModule {}
