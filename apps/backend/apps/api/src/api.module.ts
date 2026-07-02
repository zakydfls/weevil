import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from '@weevil/auth';
import { CacheModule } from '@weevil/cache';
import { AppConfigModule } from '@weevil/config';
import { DatabaseModule } from '@weevil/database';
import {
  InAppNotificationsController,
  InAppNotificationsModule,
} from '@weevil/in-app-notifications';
import { ObservabilityModule } from '@weevil/observability';
import { QueueModule } from '@weevil/queue';
import { ReportsModule } from '@weevil/reports';
import { StorageModule } from '@weevil/storage';
import { HealthController } from './health.controller';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot(),
    CacheModule,
    DatabaseModule,
    ObservabilityModule,
    QueueModule,
    StorageModule,
    InAppNotificationsModule,
    AuthModule,
    ReportsModule,
  ],
  controllers: [HealthController, InAppNotificationsController],
})
export class ApiModule {}
