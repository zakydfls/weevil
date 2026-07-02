import type { WorkspaceRole } from '@weevil/prisma-client';

export const WorkspaceEvents = {
  InviteCreated: 'workspace.invite.created',
} as const;

export interface WorkspaceInviteCreatedEvent {
  invitedEmail: string;
  inviteToken: string;
  workspaceName: string;
  workspaceSlug: string;
  role: WorkspaceRole;
  inviter: {
    email: string;
    displayName: string | null;
  } | null;
  expiresAt: Date;
}
