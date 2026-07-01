export interface EmailLayoutAction {
  label: string;
  href: string;
}

export interface EmailLayoutInput {
  title: string;
  previewText?: string;
  eyebrow?: string;
  bodyHtml: string;
  action?: EmailLayoutAction;
  footerHtml?: string;
  brandName?: string;
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const brandName = escapeHtml(input.brandName ?? 'Weevil');
  const title = escapeHtml(input.title);
  const previewText = input.previewText ? escapeHtml(input.previewText) : '';
  const eyebrow = input.eyebrow ? escapeHtml(input.eyebrow) : brandName;
  const action = input.action
    ? `<tr>
        <td style="padding:0 32px 26px;">
          <a href="${escapeHtml(input.action.href)}" style="display:inline-block;background:#b94a0b;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:700;font-size:14px;">${escapeHtml(input.action.label)}</a>
        </td>
      </tr>`
    : '';
  const footer = input.footerHtml
    ? `<tr>
        <td style="border-top:1px solid #edf0e8;padding:18px 32px;font-size:12px;line-height:1.6;color:#7a846a;">
          ${input.footerHtml}
        </td>
      </tr>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;background:#fafaf8;color:#1f2418;font-family:Inter,Arial,sans-serif;">
    ${previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${previewText}</div>` : ''}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafaf8;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #deded8;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 10px;font-size:14px;letter-spacing:.08em;text-transform:uppercase;color:#b94a0b;font-weight:700;">
                ${eyebrow}
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 8px;">
                <h1 style="margin:0;font-size:24px;line-height:1.25;color:#1f2418;">${title}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 20px;font-size:15px;line-height:1.7;color:#4f5549;">
                ${input.bodyHtml}
              </td>
            </tr>
            ${action}
            ${footer}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
