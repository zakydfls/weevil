import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from '@weevil/config';
import { DatabaseModule } from '@weevil/database';
import { InAppNotificationsModule } from '@weevil/in-app-notifications';
import { NotificationsModule } from '@weevil/notifications';
import { QueueModule } from '@weevil/queue';
import { ReportNotificationService } from '@weevil/reports';
import { StorageModule } from '@weevil/storage';
import { ArtifactConsumerService } from './worker/artifact-consumer.service';
import { ArtifactProcessingService } from './worker/artifact-processing.service';

@Module({
  imports: [
    AppConfigModule,
    EventEmitterModule.forRoot(),
    DatabaseModule,
    InAppNotificationsModule,
    NotificationsModule,
    QueueModule,
    StorageModule,
  ],
  providers: [ArtifactConsumerService, ArtifactProcessingService, ReportNotificationService],
})
export class WorkerModule {}
