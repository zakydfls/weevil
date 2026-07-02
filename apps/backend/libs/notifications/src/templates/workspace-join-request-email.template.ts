import { escapeHtml, renderEmailLayout } from './email-layout';

export interface WorkspaceJoinRequestEmailTemplateInput {
  requesterEmail: string;
  requesterName: string | null;
  workspaceName: string;
  workspaceSlug: string;
  reviewUrl: string;
}

export interface WorkspaceJoinApprovedEmailTemplateInput {
  requesterName: string | null;
  workspaceName: string;
  workspaceSlug: string;
  loginUrl: string;
}

export function workspaceJoinRequestEmailSubject(input: { workspaceName: string }): string {
  return `New access request for ${input.workspaceName}`;
}

export function workspaceJoinApprovedEmailSubject(input: { workspaceName: string }): string {
  return `Your ${input.workspaceName} access is approved`;
}

export function renderWorkspaceJoinRequestEmail(input: WorkspaceJoinRequestEmailTemplateInput): string {
  const requesterLabel = input.requesterName
    ? `${input.requesterName} (${input.requesterEmail})`
    : input.requesterEmail;
  const reviewUrl = escapeHtml(input.reviewUrl);

  return renderEmailLayout({
    eyebrow: 'Workspace access request',
    title: `Review ${input.workspaceName} access`,
    previewText: `${requesterLabel} requested access to ${input.workspaceName}.`,
    bodyHtml: `<strong>${escapeHtml(requesterLabel)}</strong> requested access to the <strong>${escapeHtml(input.workspaceName)}</strong> workspace.`,
    action: {
      label: 'Review request',
      href: input.reviewUrl,
    },
    footerHtml: `
      Workspace slug: <strong>${escapeHtml(input.workspaceSlug)}</strong><br />
      If the button does not work, open this link:<br />
      <a href="${reviewUrl}" style="color:#b94a0b;word-break:break-all;">${reviewUrl}</a>
    `,
  });
}

export function renderWorkspaceJoinApprovedEmail(input: WorkspaceJoinApprovedEmailTemplateInput): string {
  const loginUrl = escapeHtml(input.loginUrl);
  const greeting = input.requesterName ? `Hi ${escapeHtml(input.requesterName)}, ` : '';

  return renderEmailLayout({
    eyebrow: 'Workspace access approved',
    title: `Welcome to ${input.workspaceName}`,
    previewText: `Your request to join ${input.workspaceName} was approved.`,
    bodyHtml: `${greeting}your request to join <strong>${escapeHtml(input.workspaceName)}</strong> has been approved. Sign in with the email and password you used when requesting access.`,
    action: {
      label: 'Sign in to Weevil',
      href: input.loginUrl,
    },
    footerHtml: `
      Workspace slug: <strong>${escapeHtml(input.workspaceSlug)}</strong><br />
      If the button does not work, open this link:<br />
      <a href="${loginUrl}" style="color:#b94a0b;word-break:break-all;">${loginUrl}</a>
    `,
  });
}
