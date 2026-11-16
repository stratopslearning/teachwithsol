import { SendEmailCommand } from '@aws-sdk/client-sesv2';

import { env } from '@/lib/env';
import {
  emailComplianceFooter,
  emailComplianceFooterHtml,
} from '@/lib/legal';
import { EMAIL_HTML_FOOTER_MARKER } from '@/lib/email/templates';
import { getSesClient } from '@/lib/email/sesClient';

export type SendEmailResult =
  | { ok: true; messageId?: string; skipped?: boolean }
  | { ok: false; error: string };

export type SendTransactionalEmailOpts = {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  /** SES message tags (e.g. invite kind) — no PII / tokens. */
  tags?: Record<string, string>;
  /** Skip compliance footer (rare; prefer leaving on). */
  skipFooter?: boolean;
};

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to])
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

/**
 * Best-effort transactional send. Never throws.
 * When EMAIL_ENABLED=false, returns `{ ok: true, skipped: true }`.
 */
export async function sendTransactionalEmail(
  opts: SendTransactionalEmailOpts,
): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(opts.to);
  if (recipients.length === 0) {
    return { ok: false, error: 'No recipients' };
  }

  const e = env();
  if (e.EMAIL_ENABLED !== 'true') {
    return { ok: true, skipped: true };
  }

  if (!e.EMAIL_FROM || !e.AWS_REGION) {
    return { ok: false, error: 'Email is not configured' };
  }

  const textFooter = opts.skipFooter ? '' : emailComplianceFooter();
  const htmlFooter = opts.skipFooter ? '' : emailComplianceFooterHtml();
  const textBody = `${opts.text.trim()}${textFooter}`;
  const htmlBody = opts.html
    ? opts.html.includes(EMAIL_HTML_FOOTER_MARKER)
      ? opts.html.replace(EMAIL_HTML_FOOTER_MARKER, htmlFooter)
      : `${opts.html}${htmlFooter}`
    : undefined;

  try {
    const client = getSesClient();
    const result = await client.send(
      new SendEmailCommand({
        FromEmailAddress: e.EMAIL_FROM,
        ReplyToAddresses: e.EMAIL_REPLY_TO ? [e.EMAIL_REPLY_TO] : undefined,
        Destination: { ToAddresses: recipients },
        Content: {
          Simple: {
            Subject: { Data: opts.subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: textBody, Charset: 'UTF-8' },
              ...(htmlBody
                ? { Html: { Data: htmlBody, Charset: 'UTF-8' } }
                : {}),
            },
          },
        },
        EmailTags: opts.tags
          ? Object.entries(opts.tags).map(([Name, Value]) => ({
              Name: Name.slice(0, 256),
              Value: Value.slice(0, 256),
            }))
          : undefined,
      }),
    );
    return { ok: true, messageId: result.MessageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SES send failed';
    console.warn('[email] SES send failed', {
      error: message.slice(0, 300),
      recipientCount: recipients.length,
      tag: opts.tags?.kind,
    });
    // SES sandbox (ProductionAccessEnabled=false) only delivers to verified
    // identities — map to a clearer operator-facing error.
    if (/not verified|MessageRejected/i.test(message)) {
      return {
        ok: false,
        error:
          'SES could not deliver: recipient (or From) is not verified. In SES sandbox only verified addresses receive mail — verify the owner email in AWS SES, or request production access. Claim link is still available to copy.',
      };
    }
    if (/expired|reauthenticate|credentials/i.test(message)) {
      return {
        ok: false,
        error:
          'AWS credentials expired — re-run aws login for the SES profile, then resend. Claim link is still available to copy.',
      };
    }
    return { ok: false, error: message };
  }
}
