import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { PlatformRole } from '@weevil/prisma-client';
import type { AuthContext } from '../domain/auth-context';
import { PLATFORM_ROLE_KEY } from '../decorators/platform-role.decorator';

@Injectable()
export class PlatformRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PlatformRole[] | undefined>(
      PLATFORM_ROLE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const auth = request.auth;
    if (!auth) {
      throw new ForbiddenException('No auth context.');
    }
    if (!required.includes(auth.user.platformRole)) {
      throw new ForbiddenException('Platform-admin access required.');
    }
    return true;
  }
}
