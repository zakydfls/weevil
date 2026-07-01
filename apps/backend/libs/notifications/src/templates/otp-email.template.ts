import { escapeHtml, renderEmailLayout } from './email-layout';

export interface OtpEmailTemplateInput {
  code: string;
  title: string;
  purposeLabel: string;
  description: string;
  expiresAt: Date;
}

export function otpEmailSubject(input: { purposeLabel: string }): string {
  return `Your Weevil ${input.purposeLabel} code`;
}

export function renderOtpEmail(input: OtpEmailTemplateInput): string {
  const code = escapeHtml(input.code);

  return renderEmailLayout({
    eyebrow: 'Weevil verification',
    title: input.title,
    previewText: `Your Weevil ${input.purposeLabel} code is ${input.code}.`,
    bodyHtml: `
      ${escapeHtml(input.description)}
      <div style="margin:22px 0 4px;font-family:Menlo,Consolas,monospace;font-size:30px;letter-spacing:0.22em;font-weight:800;color:#1f2418;">${code}</div>
      <div style="font-size:13px;color:#6b7165;">This code expires on ${escapeHtml(formatDate(input.expiresAt))}.</div>
    `,
    footerHtml: `
      If you did not request this code, you can safely ignore this email.
      Never share this code with anyone.
    `,
  });
}

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}
