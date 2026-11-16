import { absoluteUrl } from '@/lib/siteUrl';

function formatExpires(d: Date): string {
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px">
  <tr>
    <td align="center" bgcolor="#111827" style="border-radius:8px">
      <a href="${escapeAttr(href)}"
         style="display:inline-block;padding:12px 22px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px">
        ${escapeHtml(label)}
      </a>
    </td>
  </tr>
</table>
<p style="margin:0 0 4px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#9ca3af">
  Or paste this link into your browser:<br/>
  <a href="${escapeAttr(href)}" style="color:#6b7280;word-break:break-all">${escapeHtml(href)}</a>
</p>`;
}

/**
 * Shared transactional shell: soft canvas, white card, SOL wordmark.
 * Footer is appended by `sendTransactionalEmail` (HTML + text).
 */
function wrapHtml(opts: {
  preheader?: string;
  eyebrow?: string;
  title: string;
  bodyHtml: string;
}): string {
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(opts.preheader)}</div>`
    : '';
  const eyebrow = opts.eyebrow
    ? `<p style="margin:0 0 8px;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#9ca3af">${escapeHtml(opts.eyebrow)}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6">
  ${preheader}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px">
          <tr>
            <td style="padding:28px 28px 8px;border-bottom:1px solid #f3f4f6">
              <div style="font-family:Georgia,'Times New Roman',serif;font-size:22px;letter-spacing:-0.02em;color:#111827">SOL</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px">
              ${eyebrow}
              <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.25;font-weight:400;letter-spacing:-0.02em;color:#111827">${escapeHtml(opts.title)}</h1>
              <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#374151">
                ${opts.bodyHtml}
              </div>
              <!--FOOTER-->
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function workspaceInviteEmail(opts: {
  workspaceName: string;
  role: string;
  claimUrl: string;
  expiresAt: Date;
}) {
  const roleLabel = opts.role;
  const subject = `You're invited to ${opts.workspaceName} on SOL`;
  const expires = formatExpires(opts.expiresAt);
  const text = [
    `You've been invited to join ${opts.workspaceName} as ${roleLabel}.`,
    '',
    `Claim your invite (sign in with this email):`,
    opts.claimUrl,
    '',
    `Expires ${expires}.`,
  ].join('\n');
  const html = wrapHtml({
    preheader: `Join ${opts.workspaceName} as ${roleLabel}`,
    eyebrow: 'Workspace invite',
    title: `Join ${opts.workspaceName}`,
    bodyHtml: `<p style="margin:0 0 12px">You've been invited to join <strong style="color:#111827">${escapeHtml(opts.workspaceName)}</strong> as <strong style="color:#111827">${escapeHtml(roleLabel)}</strong>.</p>
${ctaButton(opts.claimUrl, 'Claim your invite')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280">Expires ${escapeHtml(expires)}. Sign in with the invited email address.</p>`,
  });
  return { subject, text, html };
}

export function staffInviteEmail(opts: {
  sectionName: string;
  courseTitle?: string | null;
  role: 'co_instructor' | 'ta' | 'grader';
  claimUrl: string;
  expiresAt: Date;
}) {
  const roleLabel =
    opts.role === 'co_instructor'
      ? 'instructor'
      : opts.role === 'ta'
        ? 'TA'
        : 'grader';
  const where = opts.courseTitle
    ? `${opts.courseTitle} · ${opts.sectionName}`
    : opts.sectionName;
  const subject = `You're invited as ${roleLabel} for ${where} on SOL`;
  const expires = formatExpires(opts.expiresAt);
  const text = [
    `You've been invited as a ${roleLabel} for ${where}.`,
    '',
    `Claim your invite (sign in with this email):`,
    opts.claimUrl,
    '',
    `Expires ${expires}.`,
  ].join('\n');
  const html = wrapHtml({
    preheader: `${roleLabel} invite for ${where}`,
    eyebrow: 'Section faculty',
    title: `Join as ${roleLabel}`,
    bodyHtml: `<p style="margin:0 0 12px">You've been invited as a <strong style="color:#111827">${roleLabel}</strong> for <strong style="color:#111827">${escapeHtml(where)}</strong>.</p>
${ctaButton(opts.claimUrl, 'Claim your invite')}
<p style="margin:20px 0 0;font-size:13px;color:#6b7280">Expires ${escapeHtml(expires)}.</p>`,
  });
  return { subject, text, html };
}

export function studentInviteEmail(opts: {
  sectionName: string;
  courseTitle?: string | null;
  claimUrl: string;
  enrollmentCode: string;
  expiresAt: Date;
}) {
  const where = opts.courseTitle
    ? `${opts.courseTitle} · ${opts.sectionName}`
    : opts.sectionName;
  const subject = `Join ${where} on SOL`;
  const expires = formatExpires(opts.expiresAt);
  const text = [
    `You've been invited to join ${where} as a student.`,
    '',
    `Accept invite (sign in with this email):`,
    opts.claimUrl,
    '',
    `Or enroll with code: ${opts.enrollmentCode}`,
    '',
    `Expires ${expires}.`,
  ].join('\n');
  const html = wrapHtml({
    preheader: `Student invite for ${where}`,
    eyebrow: 'Student invite',
    title: `Join ${where}`,
    bodyHtml: `<p style="margin:0 0 12px">You've been invited to join <strong style="color:#111827">${escapeHtml(where)}</strong> as a student.</p>
${ctaButton(opts.claimUrl, 'Accept invite')}
<p style="margin:20px 0 0;font-size:14px;color:#374151">Or enroll with code:</p>
<p style="margin:8px 0 0;padding:10px 14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:16px;letter-spacing:0.08em;color:#111827">${escapeHtml(opts.enrollmentCode)}</p>
<p style="margin:20px 0 0;font-size:13px;color:#6b7280">Expires ${escapeHtml(expires)}.</p>`,
  });
  return { subject, text, html };
}

export function aiCapOwnerAlertEmail(opts: {
  workspaceName: string;
  used: number;
  cap: number;
  workspaceUrl: string;
}) {
  const subject = `AI cap reached for ${opts.workspaceName}`;
  const text = [
    `${opts.workspaceName} has used ${opts.used} of ${opts.cap} AI units.`,
    'New AI work (grading, authoring, materials) is paused until the period resets or you upgrade.',
    '',
    `Open workspace: ${opts.workspaceUrl}`,
  ].join('\n');
  const html = wrapHtml({
    preheader: `AI allowance used for ${opts.workspaceName}`,
    eyebrow: 'Usage alert',
    title: 'AI cap reached',
    bodyHtml: `<p style="margin:0 0 12px"><strong style="color:#111827">${escapeHtml(opts.workspaceName)}</strong> has used <strong style="color:#111827">${opts.used}</strong> of <strong style="color:#111827">${opts.cap}</strong> AI units.</p>
<p style="margin:0 0 12px">New AI work is paused until the period resets or you upgrade.</p>
${ctaButton(opts.workspaceUrl, 'Open workspace')}`,
  });
  return { subject, text, html };
}

export function accessRequestDigestEmail(opts: {
  workspaceName: string;
  pendingCount: number;
  newCount: number;
  rejectedCount: number;
  teamUrl: string;
}) {
  const subject = `Access requests for ${opts.workspaceName}`;
  const text = [
    `Daily access-request digest for ${opts.workspaceName}:`,
    `- Pending: ${opts.pendingCount}`,
    `- New in last 24h: ${opts.newCount}`,
    `- Rejected in last 24h: ${opts.rejectedCount}`,
    '',
    `Review: ${opts.teamUrl}`,
  ].join('\n');
  const html = wrapHtml({
    preheader: `${opts.pendingCount} pending request${opts.pendingCount === 1 ? '' : 's'}`,
    eyebrow: 'Daily digest',
    title: `Access requests · ${opts.workspaceName}`,
    bodyHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <tr>
    <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">Pending</td>
    <td align="right" style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:15px;font-weight:600;color:#111827">${opts.pendingCount}</td>
  </tr>
  <tr>
    <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">New (24h)</td>
    <td align="right" style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:15px;font-weight:600;color:#111827">${opts.newCount}</td>
  </tr>
  <tr>
    <td style="padding:12px 14px;font-size:13px;color:#6b7280">Rejected (24h)</td>
    <td align="right" style="padding:12px 14px;font-size:15px;font-weight:600;color:#111827">${opts.rejectedCount}</td>
  </tr>
</table>
${ctaButton(opts.teamUrl, 'Review requests')}`,
  });
  return { subject, text, html };
}

/** Always absolute (email clients can't resolve relative links), on the app host. */
export function workspaceTeamUrl(): string {
  return absoluteUrl('/dashboard/workspace');
}

/** Marker replaced by send() with the HTML compliance footer. */
export const EMAIL_HTML_FOOTER_MARKER = '<!--FOOTER-->';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;');
}
