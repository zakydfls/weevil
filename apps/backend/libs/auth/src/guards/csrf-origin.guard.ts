import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AppConfigService } from '@weevil/config';
import type { Request } from 'express';

const SESSION_COOKIE = 'wv_session';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cookie sessions need an Origin/Referer check for unsafe methods. CORS protects
 * readable browser responses; this guard protects state-changing cookie requests
 * from cross-site form/fetch attempts. Bearer-token clients are not CSRFable.
 */
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  constructor(private readonly config: AppConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.enableCsrf) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    if (SAFE_METHODS.has(method)) return true;
    if (hasBearerToken(request)) return true;
    if (hasReportToken(request)) return true;
    if (!hasSessionCookie(request)) return true;

    const allowedOrigins = this.allowedOrigins(request);
    if (allowedOrigins.size === 0 && this.config.nodeEnv !== 'production') {
      return true;
    }

    if (isAllowedOrigin(headerValue(request.headers.origin), allowedOrigins)) {
      return true;
    }

    const referer = headerValue(request.headers.referer);
    if (referer && isAllowedOrigin(originOf(referer), allowedOrigins)) {
      return true;
    }

    throw new ForbiddenException('Invalid request origin.');
  }

  private allowedOrigins(request: Request): Set<string> {
    const origins = new Set(
      this.config.browserOrigins
        .map((origin) => originOf(origin))
        .filter((origin): origin is string => Boolean(origin)),
    );
    const sameOrigin = requestOrigin(request);
    if (sameOrigin) origins.add(sameOrigin);
    return origins;
  }
}

function hasBearerToken(request: Request): boolean {
  const authorization = headerValue(request.headers.authorization);
  return authorization?.toLowerCase().startsWith('bearer ') ?? false;
}

function hasSessionCookie(request: Request): boolean {
  const cookie = headerValue(request.headers.cookie);
  return cookie?.split(/;\s*/).some((segment) => segment.startsWith(`${SESSION_COOKIE}=`)) ?? false;
}

function hasReportToken(request: Request): boolean {
  return Boolean(headerValue(request.headers['x-weevil-report-token'])?.trim());
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isAllowedOrigin(origin: string | undefined, allowedOrigins: Set<string>): boolean {
  return Boolean(origin && allowedOrigins.has(originOf(origin) ?? origin));
}

function originOf(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.origin !== 'null') {
      return url.origin;
    }
    if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
      return `${url.protocol}//${url.hostname}`;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

function requestOrigin(request: Request): string | undefined {
  const host =
    firstForwardedValue(headerValue(request.headers['x-forwarded-host'])) ?? request.headers.host;
  if (!host) return undefined;

  const proto =
    firstForwardedValue(headerValue(request.headers['x-forwarded-proto'])) ??
    (request.secure ? 'https' : request.protocol);
  return originOf(`${proto}://${host}`);
}

function firstForwardedValue(value: string | undefined): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}
