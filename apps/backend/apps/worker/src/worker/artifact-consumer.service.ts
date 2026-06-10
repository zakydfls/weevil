import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  QueueEventTypes,
  QueueNames,
  type UploadCompletedQueueMessage,
} from '@weevil/contracts';
import { QueueService } from '@weevil/queue';
import { ArtifactProcessingService } from './artifact-processing.service';

@Injectable()
export class ArtifactConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ArtifactConsumerService.name);

  constructor(
    private readonly queue: QueueService,
    private readonly artifactProcessing: ArtifactProcessingService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.queue.consumeJson(QueueNames.ArtifactProcessing, (payload) =>
      this.handleUploadCompleted(payload),
    );
    this.logger.log(`Consuming queue ${QueueNames.ArtifactProcessing}`);
  }

  private async handleUploadCompleted(payload: Record<string, unknown>): Promise<void> {
    if (!this.isUploadCompletedMessage(payload)) {
      this.logger.warn('Ignored unsupported queue message');
      return;
    }

    await this.artifactProcessing.processUpload(payload.reportId, payload.uploadId);
  }

  private isUploadCompletedMessage(
    payload: Record<string, unknown>,
  ): payload is UploadCompletedQueueMessage {
    return (
      payload.eventType === QueueEventTypes.UploadCompleted &&
      typeof payload.reportId === 'string' &&
      typeof payload.uploadId === 'string' &&
      typeof payload.occurredAt === 'string'
    );
  }
}
