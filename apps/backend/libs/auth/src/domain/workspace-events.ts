import type { WorkspaceRole } from '@weevil/prisma-client';

export const WorkspaceEvents = {
  InviteCreated: 'workspace.invite.created',
  JoinRequested: 'workspace.join.requested',
  JoinApproved: 'workspace.join.approved',
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

export interface WorkspaceJoinRequestedEvent {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  memberId: string;
  requesterEmail: string;
  requesterName: string | null;
}

export interface WorkspaceJoinApprovedEvent {
  workspaceName: string;
  workspaceSlug: string;
  requesterEmail: string;
  requesterName: string | null;
}
