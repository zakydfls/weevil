import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@weevil/prisma-client';

export const PERMISSIONS_KEY = 'weevil:permissions';

export interface PermissionRequirement {
  permissions: Permission | Permission[];
  /** 'all' = must have every listed permission. 'any' = at least one. */
  mode?: 'all' | 'any';
}

/**
 * Declarative permission check on a controller method or class.
 *
 * @example
 *   @RequirePermissions(Permission.MEMBER_INVITE)
 *   invite(@Body() body: InviteDto) { ... }
 *
 *   @RequirePermissions([Permission.REPORT_READ_ALL, Permission.REPORT_READ_OWN], 'any')
 *   list() { ... }
 */
export function RequirePermissions(
  permissions: Permission | Permission[],
  mode: 'all' | 'any' = 'all',
) {
  return SetMetadata(PERMISSIONS_KEY, { permissions, mode } satisfies PermissionRequirement);
}
