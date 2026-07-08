import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService<Env, true>) {}

  get nodeEnv(): Env['NODE_ENV'] {
    return this.configService.get('NODE_ENV', { infer: true });
  }

  get appName(): string {
    return this.configService.get('APP_NAME', { infer: true });
  }

  get apiPort(): number {
    return this.configService.get('API_PORT', { infer: true });
  }

  get databaseUrl(): string {
    return this.configService.get('DATABASE_URL', { infer: true });
  }

  get redisUrl(): string {
    return this.configService.get('REDIS_URL', { infer: true });
  }

  get rabbitmqUrl(): string {
    return this.configService.get('RABBITMQ_URL', { infer: true });
  }

  get minioEndpoint(): string {
    return this.configService.get('MINIO_ENDPOINT', { infer: true });
  }

  get minioPort(): number {
    return this.configService.get('MINIO_PORT', { infer: true });
  }

  get minioAccessKey(): string {
    return this.configService.get('MINIO_ACCESS_KEY', { infer: true });
  }

  get minioSecretKey(): string {
    return this.configService.get('MINIO_SECRET_KEY', { infer: true });
  }

  get minioUseSsl(): boolean {
    return this.configService.get('MINIO_USE_SSL', { infer: true });
  }

  get recordingsBucket(): string {
    return this.configService.get('MINIO_BUCKET_RECORDINGS', { infer: true });
  }

  get publicAssetUrl(): string | undefined {
    return this.configService.get('PUBLIC_ASSET_URL', { infer: true }) || undefined;
  }

  get enableCors(): boolean {
    return this.configService.get('ENABLE_CORS', { infer: true });
  }

  get enableCsrf(): boolean {
    return this.configService.get('ENABLE_CSRF', { infer: true });
  }

  /** Allowed browser origins for CORS. Empty array = reflect any origin (dev). */
  get webOrigins(): string[] {
    return parseOriginList(this.configService.get('WEB_ORIGIN', { infer: true }));
  }

  /** Trusted extension origins allowed to use cookie-authenticated capture APIs. */
  get extensionOrigins(): string[] {
    return parseOriginList([
      this.configService.get('EXTENSION_ORIGINS', { infer: true }),
      this.configService.get('EXTENSION_ORIGIN', { infer: true }),
    ]);
  }

  get browserOrigins(): string[] {
    return [...this.webOrigins, ...this.extensionOrigins];
  }

  get cookieSameSite(): 'lax' | 'none' | 'strict' {
    return this.configService.get('COOKIE_SAMESITE', { infer: true });
  }

  get cookieSecure(): boolean {
    return this.configService.get('COOKIE_SECURE', { infer: true });
  }

  get cookieDomain(): string | undefined {
    return this.configService.get('COOKIE_DOMAIN', { infer: true }) || undefined;
  }

  get webAppUrl(): string | undefined {
    return this.configService.get('WEB_APP_URL', { infer: true }) || undefined;
  }

  get notificationGatewayUrl(): string | undefined {
    return this.configService.get('NOTIFICATION_GATEWAY_URL', { infer: true }) || undefined;
  }

  get notificationGatewayApiKey(): string | undefined {
    return this.configService.get('NOTIFICATION_GATEWAY_API_KEY', { infer: true }) || undefined;
  }

  get notificationGatewayTimeoutMs(): number {
    return this.configService.get('NOTIFICATION_GATEWAY_TIMEOUT_MS', { infer: true });
  }

  get authOtpSecret(): string | undefined {
    return this.configService.get('AUTH_OTP_SECRET', { infer: true }) || undefined;
  }
}

function parseOriginList(value: string | string[]): string[] {
  const raw = Array.isArray(value) ? value.join(',') : value;
  return raw
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin));
}

function normalizeOrigin(value: string): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.origin !== 'null') {
      return url.origin;
    }
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
      return `${url.protocol}//${url.hostname}`;
    }
  } catch {
    return value;
  }

  return value;
}
