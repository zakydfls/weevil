import { escapeHtml, renderEmailLayout } from './email-layout';

export interface ReportNotificationDetail {
  title: string;
  workspaceName: string;
  projectName?: string | null;
  pageUrl?: string | null;
  reporterLabel?: string | null;
  browserLabel?: string | null;
  createdAt: Date;
  captureUrl: string;
}

export interface ReportCommentEmailTemplateInput {
  report: ReportNotificationDetail;
  authorLabel: string;
  commentBody: string;
  mentioned?: boolean;
}

export interface NewCaptureEmailTemplateInput {
  report: ReportNotificationDetail;
  consoleCount: number;
  networkCount: number;
  actionCount: number;
  errorCount: number;
}

export interface ReportAssignedEmailTemplateInput {
  report: ReportNotificationDetail;
  assigneeLabel: string;
}

export function reportCommentEmailSubject(input: { reportTitle: string; mentioned?: boolean }): string {
  return `${input.mentioned ? 'You were mentioned on' : 'New comment on'} ${input.reportTitle}`;
}

export function newCaptureEmailSubject(input: { reportTitle: string }): string {
  return `New capture: ${input.reportTitle}`;
}

export function reportAssignedEmailSubject(input: { reportTitle: string }): string {
  return `You were assigned: ${input.reportTitle}`;
}

export function renderReportCommentEmail(input: ReportCommentEmailTemplateInput): string {
  const report = input.report;
  const captureUrl = escapeHtml(report.captureUrl);

  return renderEmailLayout({
    eyebrow: 'Weevil capture comment',
    title: reportCommentEmailSubject({ reportTitle: report.title, mentioned: input.mentioned }),
    previewText: `${input.authorLabel} ${input.mentioned ? 'mentioned you' : 'commented'} on ${report.title}.`,
    bodyHtml: `
      <p style="margin:0 0 14px;">${escapeHtml(input.authorLabel)} ${input.mentioned ? 'mentioned you in a comment' : 'commented'} on <strong>${escapeHtml(report.title)}</strong>.</p>
      ${renderQuote(input.commentBody)}
      ${renderReportDetails(report)}
    `,
    action: {
      label: 'Open capture',
      href: report.captureUrl,
    },
    footerHtml: `
      Workspace: <strong>${escapeHtml(report.workspaceName)}</strong><br />
      If the button does not work, open this link:<br />
      <a href="${captureUrl}" style="color:#b94a0b;word-break:break-all;">${captureUrl}</a>
    `,
  });
}

export function renderNewCaptureEmail(input: NewCaptureEmailTemplateInput): string {
  const report = input.report;
  const captureUrl = escapeHtml(report.captureUrl);

  return renderEmailLayout({
    eyebrow: 'Weevil capture',
    title: report.title,
    previewText: `A new capture was created in ${report.workspaceName}.`,
    bodyHtml: `
      <p style="margin:0 0 14px;">A new capture was created in <strong>${escapeHtml(report.workspaceName)}</strong>.</p>
      ${renderTelemetrySummary(input)}
      ${renderReportDetails(report)}
    `,
    action: {
      label: 'Open capture',
      href: report.captureUrl,
    },
    footerHtml: `
      Workspace: <strong>${escapeHtml(report.workspaceName)}</strong><br />
      If the button does not work, open this link:<br />
      <a href="${captureUrl}" style="color:#b94a0b;word-break:break-all;">${captureUrl}</a>
    `,
  });
}

export function renderReportAssignedEmail(input: ReportAssignedEmailTemplateInput): string {
  const report = input.report;
  const captureUrl = escapeHtml(report.captureUrl);

  return renderEmailLayout({
    eyebrow: 'Weevil capture assignment',
    title: `You were assigned to ${report.title}`,
    previewText: `You were assigned to ${report.title} in ${report.workspaceName}.`,
    bodyHtml: `
      <p style="margin:0 0 14px;">${escapeHtml(input.assigneeLabel)}, you were assigned to <strong>${escapeHtml(report.title)}</strong>.</p>
      ${renderReportDetails(report)}
    `,
    action: {
      label: 'Open capture',
      href: report.captureUrl,
    },
    footerHtml: `
      Workspace: <strong>${escapeHtml(report.workspaceName)}</strong><br />
      If the button does not work, open this link:<br />
      <a href="${captureUrl}" style="color:#b94a0b;word-break:break-all;">${captureUrl}</a>
    `,
  });
}

function renderQuote(value: string): string {
  return `
    <div style="margin:16px 0;padding:14px 16px;border:1px solid #eaded5;border-radius:8px;background:#fff6f0;color:#2a211b;">
      ${escapeHtml(truncate(value, 800)).replace(/\n/g, '<br />')}
    </div>
  `;
}

function renderTelemetrySummary(input: NewCaptureEmailTemplateInput): string {
  const items = [
    ['Console', input.consoleCount],
    ['Network', input.networkCount],
    ['Actions', input.actionCount],
    ['Errors', input.errorCount],
  ];

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:16px 0;border:1px solid #edf0e8;border-radius:8px;overflow:hidden;">
      <tr>
        ${items.map(([label, value]) => `
          <td style="padding:12px 10px;border-right:1px solid #edf0e8;text-align:center;">
            <div style="font-size:18px;font-weight:800;color:#1f2418;">${value}</div>
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#7a846a;">${label}</div>
          </td>
        `).join('')}
      </tr>
    </table>
  `;
}

function renderReportDetails(report: ReportNotificationDetail): string {
  const rows = [
    ['Workspace', report.workspaceName],
    ['Project', report.projectName],
    ['Reporter', report.reporterLabel],
    ['Page URL', report.pageUrl],
    ['Browser', report.browserLabel],
    ['Captured', formatDate(report.createdAt)],
  ].filter(([, value]) => Boolean(value));

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin:16px 0 0;border-top:1px solid #edf0e8;">
      ${rows.map(([label, value]) => `
        <tr>
          <td style="width:112px;padding:10px 10px 10px 0;border-bottom:1px solid #edf0e8;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#7a846a;">${escapeHtml(label ?? '')}</td>
          <td style="padding:10px 0;border-bottom:1px solid #edf0e8;color:#1f2418;word-break:break-word;">${escapeHtml(value ?? '')}</td>
        </tr>
      `).join('')}
    </table>
  `;
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}
