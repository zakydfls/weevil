import { Injectable } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';

export type NotificationChannel = 'sms' | 'whatsapp' | 'email';

export interface EnqueueNotificationInput {
  channel: NotificationChannel;
  recipient: string;
  body?: string;
  templateKey?: string;
  templateParams?: Record<string, unknown>;
  providerTemplateId?: string;
  providerTemplateVars?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface EnqueueNotificationResult {
  notificationId: string | null;
}

interface NotificationGatewayEnvelope {
  data?: {
    notification_id?: unknown;
  };
  message?: unknown;
}

export class NotificationGatewayConfigError extends Error {
  constructor(message = 'Notification gateway is not configured.') {
    super(message);
  }
}

export class NotificationGatewayRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class NotificationGatewayClient {
  constructor(private readonly config: AppConfigService) {}

  async enqueue(input: EnqueueNotificationInput): Promise<EnqueueNotificationResult> {
    const endpoint = this.notificationEndpoint();
    const apiKey = this.config.notificationGatewayApiKey;
    if (!endpoint || !apiKey) {
      throw new NotificationGatewayConfigError();
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.notificationGatewayTimeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-notification-key': apiKey,
          'X-Century-Service': this.config.appName,
        },
        body: JSON.stringify(toGatewayPayload(input)),
        signal: controller.signal,
      });

      const text = await response.text();
      const parsed = parseGatewayEnvelope(text);
      if (!response.ok) {
        throw new NotificationGatewayRequestError(
          gatewayErrorMessage(parsed, text),
          response.status,
        );
      }

      return { notificationId: extractNotificationId(parsed) };
    } catch (error) {
      if (
        error instanceof NotificationGatewayConfigError ||
        error instanceof NotificationGatewayRequestError
      ) {
        throw error;
      }
      throw new NotificationGatewayRequestError(errorMessage(error));
    } finally {
      clearTimeout(timeout);
    }
  }

  private notificationEndpoint(): string | null {
    const baseUrl = normalizeAbsoluteBaseUrl(this.config.notificationGatewayUrl);
    if (!baseUrl) return null;

    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/+$/, '');
    if (path.endsWith('/api/v1/notifications')) {
      return url.toString();
    }
    url.pathname = path.endsWith('/api/v1')
      ? `${path}/notifications`
      : `${path}/api/v1/notifications`;
    return url.toString();
  }
}

function toGatewayPayload(input: EnqueueNotificationInput): Record<string, unknown> {
  return compactObject({
    channel: input.channel,
    recipient: input.recipient,
    body: input.body,
    template_key: input.templateKey,
    template_params: input.templateParams,
    provider_template_id: input.providerTemplateId,
    provider_template_vars: input.providerTemplateVars,
    metadata: input.metadata,
  });
}

function compactObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== null),
  );
}

function normalizeAbsoluteBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${isLocalHost(trimmed) ? 'http' : 'https'}://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function isLocalHost(value: string): boolean {
  return /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(value);
}

function parseGatewayEnvelope(text: string): NotificationGatewayEnvelope | null {
  if (!text.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function extractNotificationId(payload: NotificationGatewayEnvelope | null): string | null {
  const notificationId = payload?.data?.notification_id;
  return typeof notificationId === 'string' ? notificationId : null;
}

function gatewayErrorMessage(
  payload: NotificationGatewayEnvelope | null,
  fallback: string,
): string {
  return typeof payload?.message === 'string' && payload.message.trim()
    ? payload.message
    : fallback.slice(0, 240);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
