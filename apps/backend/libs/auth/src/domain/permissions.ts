import { Permission, WorkspaceRole } from '@weevil/prisma-client';

/**
 * Role → default permission set. Override per-member via
 * `WorkspaceMember.extraPermissions` (additive) and `WorkspaceMember.deniedPermissions` (subtractive).
 *
 * Hierarchy: OWNER ⊇ ADMIN ⊇ MEMBER ⊇ VIEWER (each adds to the lower one).
 */
const VIEWER_PERMISSIONS: Permission[] = [Permission.WORKSPACE_VIEW, Permission.REPORT_READ_ALL];

const MEMBER_PERMISSIONS: Permission[] = [
  ...VIEWER_PERMISSIONS,
  Permission.REPORT_CREATE,
  Permission.REPORT_READ_OWN,
  Permission.REPORT_UPDATE_OWN,
  Permission.REPORT_DELETE_OWN,
  Permission.REPORT_SHARE,
  Permission.COMMENT_CREATE,
  Permission.COMMENT_DELETE_OWN,
];

const ADMIN_PERMISSIONS: Permission[] = [
  ...MEMBER_PERMISSIONS,
  Permission.WORKSPACE_UPDATE,
  Permission.MEMBER_INVITE,
  Permission.MEMBER_REMOVE,
  Permission.MEMBER_ROLE_UPDATE,
  Permission.PROJECT_CREATE,
  Permission.PROJECT_UPDATE,
  Permission.PROJECT_DELETE,
  Permission.REPORT_UPDATE_ANY,
  Permission.REPORT_DELETE_ANY,
  Permission.COMMENT_DELETE_ANY,
  Permission.API_TOKEN_MANAGE,
  Permission.INTEGRATION_MANAGE,
  Permission.BOARD_MANAGE,
];

const OWNER_PERMISSIONS: Permission[] = [
  ...ADMIN_PERMISSIONS,
  Permission.WORKSPACE_DELETE,
  Permission.WORKSPACE_BILLING,
];

export const ROLE_DEFAULTS: Record<WorkspaceRole, ReadonlySet<Permission>> = {
  [WorkspaceRole.OWNER]: new Set(OWNER_PERMISSIONS),
  [WorkspaceRole.ADMIN]: new Set(ADMIN_PERMISSIONS),
  [WorkspaceRole.MEMBER]: new Set(MEMBER_PERMISSIONS),
  [WorkspaceRole.VIEWER]: new Set(VIEWER_PERMISSIONS),
};

/**
 * Effective permission set for a workspace member.
 * Resolution: role defaults ∪ extraPermissions \ deniedPermissions.
 */
export function resolveEffectivePermissions(
  role: WorkspaceRole,
  extraPermissions: Permission[] = [],
  deniedPermissions: Permission[] = [],
): Set<Permission> {
  const base = new Set<Permission>(ROLE_DEFAULTS[role]);
  for (const extra of extraPermissions) {
    base.add(extra);
  }
  for (const denied of deniedPermissions) {
    base.delete(denied);
  }
  return base;
}

export function hasPermission(
  effective: ReadonlySet<Permission>,
  required: Permission | Permission[],
  mode: 'all' | 'any' = 'all',
): boolean {
  const list = Array.isArray(required) ? required : [required];
  if (list.length === 0) return true;
  if (mode === 'all') {
    return list.every((permission) => effective.has(permission));
  }
  return list.some((permission) => effective.has(permission));
}
