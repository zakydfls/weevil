import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Permission } from '@weevil/prisma-client';
import { PermissionService } from '../application/permission.service';
import type { AuthContext } from '../domain/auth-context';
import {
  PERMISSIONS_KEY,
  type PermissionRequirement,
} from '../decorators/require-permissions.decorator';

/**
 * Enforces @RequirePermissions(...) metadata on routes.
 * Runs after AuthGuard (which populates req.auth).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionService: PermissionService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<PermissionRequirement | undefined>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) return true;

    const request = context.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const auth = request.auth;
    if (!auth) {
      throw new ForbiddenException('No auth context — did AuthGuard run?');
    }
    const required: Permission[] = Array.isArray(requirement.permissions)
      ? requirement.permissions
      : [requirement.permissions];
    this.permissionService.assert(auth, required, requirement.mode ?? 'all');
    return true;
  }
}
