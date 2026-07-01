import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthContext } from '../domain/auth-context';

/**
 * Inject the resolved AuthContext into a controller method.
 *
 * @example
 *   @Get()
 *   list(@CurrentAuth() auth: AuthContext) {
 *     return this.reportsService.list({ workspaceId: auth.workspace!.id });
 *   }
 */
export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (!request.auth) {
      throw new Error('No auth context — is AuthGuard installed?');
    }
    return request.auth;
  },
);

/**
 * Returns the auth context if one was populated, otherwise null. Useful on
 * @Public routes that BEHAVE differently when the caller is authenticated
 * (e.g. extension's POST /reports — uses caller's workspace if signed in,
 * else falls back to dev tenant).
 */
export const OptionalAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext | null => {
    const request = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    return request.auth ?? null;
  },
);
