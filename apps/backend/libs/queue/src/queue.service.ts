import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';
import { QueueExchange, QueueNames, QueueRoutingKeys } from '@weevil/contracts';
import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConsumeMessage, Options } from 'amqplib';

type JsonRecord = Record<string, unknown>;

@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private connection?: ChannelModel;
  private channel?: Channel;

  constructor(private readonly config: AppConfigService) {}

  async onModuleInit(): Promise<void> {
    this.connection = await amqp.connect(this.config.rabbitmqUrl);
    this.channel = await this.connection.createChannel();
    await this.assertTopology(this.channel);
  }

  async onModuleDestroy(): Promise<void> {
    await this.channel?.close();
    await this.connection?.close();
  }

  publishJson(routingKey: string, payload: JsonRecord): void {
    const channel = this.getChannel();
    const buffer = Buffer.from(JSON.stringify(payload));
    const options: Options.Publish = {
      contentType: 'application/json',
      deliveryMode: 2,
      persistent: true,
      timestamp: Date.now(),
    };

    const accepted = channel.publish(QueueExchange.Reports, routingKey, buffer, options);

    if (!accepted) {
      this.logger.warn(`RabbitMQ write buffer is full for routing key ${routingKey}`);
    }
  }

  async consumeJson(
    queueName: string,
    handler: (payload: JsonRecord, message: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    const channel = this.getChannel();

    await channel.consume(queueName, (message) => {
      void this.handleMessage(message, handler);
    });
  }

  private async handleMessage(
    message: ConsumeMessage | null,
    handler: (payload: JsonRecord, message: ConsumeMessage) => Promise<void>,
  ): Promise<void> {
    if (!message) {
      return;
    }

    const channel = this.getChannel();

    try {
      const payload = JSON.parse(message.content.toString('utf8')) as JsonRecord;
      await handler(payload, message);
      channel.ack(message);
    } catch (error) {
      this.logger.error('Failed to consume RabbitMQ message', error);
      channel.nack(message, false, false);
    }
  }

  private getChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }

    return this.channel;
  }

  private async assertTopology(channel: Channel): Promise<void> {
    await channel.assertExchange(QueueExchange.Reports, 'direct', { durable: true });
    await channel.assertQueue(QueueNames.ArtifactProcessing, { durable: true });
    await channel.bindQueue(
      QueueNames.ArtifactProcessing,
      QueueExchange.Reports,
      QueueRoutingKeys.UploadCompleted,
    );
  }
}
