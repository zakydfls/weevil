import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AuthService } from '../application/auth.service';
import { PermissionService } from '../application/permission.service';
import type { AuthContext } from '../domain/auth-context';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Verifies the bearer token (or session cookie), loads the active workspace
 * (from header `x-weevil-workspace` or URL param `:workspaceSlug`), and
 * attaches the resolved AuthContext to `req.auth`.
 *
 * Apply globally in ApiModule via `{ provide: APP_GUARD, useClass: AuthGuard }`.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionService: PermissionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const rawToken = extractToken(request);

    // Public routes still get auth populated when a token is present (so the
    // extension's POST /reports can run in the user's workspace if signed in,
    // and gracefully fall back to dev-tenant when unauthenticated).
    if (!rawToken) {
      if (isPublic) return true;
      throw new UnauthorizedException('Missing bearer token.');
    }

    const session = await this.authService.verifyToken(rawToken);
    if (!session) {
      if (isPublic) return true;
      throw new UnauthorizedException('Session expired or invalid.');
    }

    let workspaceCtx: AuthContext['workspace'] = null;
    const workspaceSlug =
      (request.headers['x-weevil-workspace'] as string | undefined) ??
      extractWorkspaceSlugFromParams(request);
    try {
      if (workspaceSlug) {
        workspaceCtx = await this.permissionService.loadWorkspaceBySlug(
          session.userId,
          workspaceSlug,
        );
      } else if (session.workspaceId) {
        workspaceCtx = await this.permissionService.loadWorkspaceContext(
          session.userId,
          session.workspaceId,
        );
      }
    } catch (error) {
      // On public routes, missing workspace membership shouldn't 403 — just leave it null.
      if (!isPublic) throw error;
    }

    request.auth = {
      user: {
        id: session.user.id,
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        phoneNumber: session.user.phoneNumber,
        phoneVerifiedAt: session.user.phoneVerifiedAt,
        displayName: session.user.displayName,
        platformRole: session.user.platformRole,
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt,
      },
      workspace: workspaceCtx,
    };
    return true;
  }
}

function extractToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (header && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  const cookieHeader = request.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.split(/;\s*/).find((segment) => segment.startsWith('wv_session='));
    if (match) return decodeURIComponent(match.slice('wv_session='.length));
  }
  return null;
}

function extractWorkspaceSlugFromParams(request: Request): string | null {
  const params = request.params as Record<string, string> | undefined;
  return params?.workspaceSlug ?? params?.['workspaceSlug'] ?? null;
}
