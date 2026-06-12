import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@weevil/database';
import { MembershipStatus, Permission, WorkspaceStatus } from '@weevil/prisma-client';
import type { AuthContext } from '../domain/auth-context';
import { hasPermission, resolveEffectivePermissions } from '../domain/permissions';

/**
 * Permission lookup + enforcement. Wraps the effective-permission resolver
 * and adds workspace-load + status checks.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Loads a user's membership in a workspace and resolves their effective permissions.
   * Throws ForbiddenException if the user is not a member or the workspace/membership is inactive.
   */
  async loadWorkspaceContext(
    userId: string,
    workspaceId: string,
  ): Promise<AuthContext['workspace']> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: true },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new ForbiddenException('You are not a member of this workspace.');
    }
    if (membership.workspace.status !== WorkspaceStatus.ACTIVE) {
      throw new ForbiddenException('Workspace is suspended.');
    }
    const permissions = resolveEffectivePermissions(
      membership.role,
      membership.extraPermissions,
      membership.deniedPermissions,
    );
    return {
      id: membership.workspace.id,
      slug: membership.workspace.slug,
      role: membership.role,
      permissions,
    };
  }

  /**
   * Loads a workspace by slug for a given user. Used by the workspace-resolver
   * middleware when the URL carries `/:workspaceSlug/...`.
   */
  async loadWorkspaceBySlug(userId: string, slug: string): Promise<AuthContext['workspace']> {
    const workspace = await this.prisma.workspace.findUnique({ where: { slug } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    return this.loadWorkspaceContext(userId, workspace.id);
  }

  /**
   * Assert the auth context has every permission in `required` (or any, if mode='any').
   * Throws ForbiddenException otherwise.
   */
  assert(
    auth: AuthContext,
    required: Permission | Permission[],
    mode: 'all' | 'any' = 'all',
  ): void {
    if (!auth.workspace) {
      throw new ForbiddenException('No active workspace for this request.');
    }
    if (!hasPermission(auth.workspace.permissions, required, mode)) {
      throw new ForbiddenException(
        `Missing required permission${Array.isArray(required) && required.length > 1 ? 's' : ''}: ${
          Array.isArray(required) ? required.join(', ') : required
        }`,
      );
    }
  }

  /** Non-throwing variant — useful in services / list filters. */
  can(
    auth: AuthContext,
    required: Permission | Permission[],
    mode: 'all' | 'any' = 'all',
  ): boolean {
    if (!auth.workspace) return false;
    return hasPermission(auth.workspace.permissions, required, mode);
  }
}
