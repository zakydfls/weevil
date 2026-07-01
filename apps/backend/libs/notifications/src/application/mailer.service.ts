import { Injectable, Logger } from '@nestjs/common';
import { NotificationGatewayClient } from './notification-gateway.client';

export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  fromAddress?: string;
  fromName?: string;
  replyTo?: string;
  cc?: string[];
  bcc?: string[];
  metadata?: Record<string, unknown>;
}

export interface SendEmailResult {
  sent: boolean;
  notificationId: string | null;
  errorMessage: string | null;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly notificationGateway: NotificationGatewayClient) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    const body = input.html ?? input.text;
    if (!body) {
      return {
        sent: false,
        notificationId: null,
        errorMessage: 'Email body is required.',
      };
    }

    try {
      const result = await this.notificationGateway.enqueue({
        channel: 'email',
        recipient: input.to,
        body,
        metadata: compactObject({
          ...input.metadata,
          subject: input.subject,
          content_type: input.html ? 'text/html' : 'text/plain',
          from_address: input.fromAddress,
          from_name: input.fromName,
          reply_to: input.replyTo,
          cc: input.cc,
          bcc: input.bcc,
        }),
      });

      return {
        sent: true,
        notificationId: result.notificationId,
        errorMessage: null,
      };
    } catch (error) {
      const message = errorMessage(error);
      this.logger.warn(`Email notification failed for ${input.to}: ${message}`);
      return {
        sent: false,
        notificationId: null,
        errorMessage: message,
      };
    }
  }
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === undefined || entry === null) return false;
      if (Array.isArray(entry)) return entry.length > 0;
      return true;
    }),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
