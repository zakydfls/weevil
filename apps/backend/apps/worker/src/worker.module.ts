import { Module } from '@nestjs/common';
import { AppConfigModule } from '@weevil/config';
import { DatabaseModule } from '@weevil/database';
import { QueueModule } from '@weevil/queue';
import { StorageModule } from '@weevil/storage';
import { ArtifactConsumerService } from './worker/artifact-consumer.service';
import { ArtifactProcessingService } from './worker/artifact-processing.service';

@Module({
  imports: [AppConfigModule, DatabaseModule, QueueModule, StorageModule],
  providers: [ArtifactConsumerService, ArtifactProcessingService],
})
export class WorkerModule {}
