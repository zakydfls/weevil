import { SetMetadata } from '@nestjs/common';
import type { PlatformRole } from '@weevil/prisma-client';

export const PLATFORM_ROLE_KEY = 'weevil:platform-role';

/**
 * Restricts a route to users with a specific platform role.
 * Useful for the platform-admin surface (tenant management, billing, analytics).
 *
 * @example
 *   @RequirePlatformRole('PLATFORM_ADMIN')
 *   @Get('workspaces')
 *   listAllWorkspaces() { ... }
 */
export function RequirePlatformRole(role: PlatformRole | PlatformRole[]) {
  return SetMetadata(PLATFORM_ROLE_KEY, Array.isArray(role) ? role : [role]);
}
