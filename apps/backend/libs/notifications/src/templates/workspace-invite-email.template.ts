import { escapeHtml, renderEmailLayout } from './email-layout';

export interface WorkspaceInviteEmailTemplateInput {
  inviteUrl: string;
  inviterLabel: string;
  role: string;
  workspaceName: string;
  workspaceSlug: string;
  expiresAt: Date;
}

export function workspaceInviteEmailSubject(input: { workspaceName: string }): string {
  return `You're invited to ${input.workspaceName} on Weevil`;
}

export function renderWorkspaceInviteEmail(input: WorkspaceInviteEmailTemplateInput): string {
  const inviteUrl = escapeHtml(input.inviteUrl);
  const workspaceName = escapeHtml(input.workspaceName);
  const roleLabel = escapeHtml(input.role.toLowerCase());

  return renderEmailLayout({
    eyebrow: 'Weevil workspace invite',
    title: `Join ${input.workspaceName}`,
    previewText: `${input.inviterLabel} invited you to join ${input.workspaceName}.`,
    bodyHtml: `${escapeHtml(input.inviterLabel)} invited you to join the <strong>${workspaceName}</strong> workspace as <strong>${roleLabel}</strong>.`,
    action: {
      label: 'Accept invitation',
      href: input.inviteUrl,
    },
    footerHtml: `
      Workspace slug: <strong>${escapeHtml(input.workspaceSlug)}</strong><br />
      This invitation expires on ${escapeHtml(formatDate(input.expiresAt))}.<br /><br />
      If the button does not work, open this link:<br />
      <a href="${inviteUrl}" style="color:#b94a0b;word-break:break-all;">${inviteUrl}</a>
    `,
  });
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
