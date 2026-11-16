import { and, eq } from 'drizzle-orm';

import { db } from '@/app/db';
import { emailNotifications, workspaces } from '@/app/db/schema';
import { withTenant } from '@/lib/db/tenantContext';
import { listWorkspaceOwnerAdminEmails } from '@/lib/email/owners';
import { sendTransactionalEmail } from '@/lib/email/send';
import {
  aiCapOwnerAlertEmail,
  workspaceTeamUrl,
} from '@/lib/email/templates';

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Email workspace owners/admins once per UTC day when AI cap blocks work.
 * Best-effort; never throws.
 */
export async function maybeNotifyAiCapOwners(opts: {
  workspaceId: string;
  used: number;
  cap: number;
}): Promise<void> {
  try {
    if (!opts.workspaceId || opts.workspaceId === 'default') return;

    const periodKey = utcDayKey();
    const alreadySent = await withTenant(opts.workspaceId, null, async (tx) => {
      const existing = await tx.query.emailNotifications.findFirst({
        where: and(
          eq(emailNotifications.workspaceId, opts.workspaceId),
          eq(emailNotifications.kind, 'ai_cap'),
          eq(emailNotifications.periodKey, periodKey),
        ),
        columns: { id: true },
      });
      return Boolean(existing);
    });
    if (alreadySent) return;

    const recipients = await listWorkspaceOwnerAdminEmails(opts.workspaceId);
    if (recipients.length === 0) return;

    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, opts.workspaceId),
      columns: { name: true },
    });

    const tpl = aiCapOwnerAlertEmail({
      workspaceName: workspace?.name ?? 'Your workspace',
      used: opts.used,
      cap: opts.cap,
      workspaceUrl: workspaceTeamUrl(),
    });

    const sent = await sendTransactionalEmail({
      to: recipients,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
      tags: { kind: 'ai_cap' },
    });

    if (!sent.ok) return;
    if ('skipped' in sent && sent.skipped) return;

    try {
      await withTenant(opts.workspaceId, null, async (tx) => {
        await tx.insert(emailNotifications).values({
          workspaceId: opts.workspaceId,
          kind: 'ai_cap',
          periodKey,
          metadata: { used: opts.used, cap: opts.cap },
        });
      });
    } catch {
      // Unique race: another instance already recorded today's send.
    }
  } catch (err) {
    console.warn('[email] ai cap alert failed', {
      workspaceId: opts.workspaceId,
      error: err instanceof Error ? err.message.slice(0, 200) : 'unknown',
    });
  }
}
