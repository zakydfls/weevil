import { Module } from '@nestjs/common';
import { CacheModule } from '@weevil/cache';
import { AppConfigModule } from '@weevil/config';
import { DatabaseModule } from '@weevil/database';
import { ObservabilityModule } from '@weevil/observability';
import { QueueModule } from '@weevil/queue';
import { ReportsModule } from '@weevil/reports';
import { StorageModule } from '@weevil/storage';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AppConfigModule,
    CacheModule,
    DatabaseModule,
    ObservabilityModule,
    QueueModule,
    StorageModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class ApiModule {}
