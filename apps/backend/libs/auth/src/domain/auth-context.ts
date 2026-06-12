import type { Permission, PlatformRole, WorkspaceRole } from '@weevil/prisma-client';

/**
 * Per-request authentication context. Attached to `req.auth` by the AuthGuard
 * after a successful session/token verification.
 */
export interface AuthContext {
  /** Authenticated user — always present on protected routes. */
  user: {
    id: string;
    email: string;
    displayName: string | null;
    platformRole: PlatformRole;
  };
  /** Current session metadata. */
  session: {
    id: string;
    expiresAt: Date;
  };
  /** Active workspace for this request. Null only on workspace-agnostic routes. */
  workspace: {
    id: string;
    slug: string;
    role: WorkspaceRole;
    /** Resolved effective permissions for the user in this workspace. */
    permissions: ReadonlySet<Permission>;
  } | null;
}
