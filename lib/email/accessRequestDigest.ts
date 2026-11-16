import { and, eq } from 'drizzle-orm';

import { db } from '@/app/db';
import { emailNotifications, workspaces } from '@/app/db/schema';
import { withTenant } from '@/lib/db/tenantContext';
import { listWorkspaceOwnerAdminEmails } from '@/lib/email/owners';
import { sendTransactionalEmail } from '@/lib/email/send';
import {
  accessRequestDigestEmail,
  workspaceTeamUrl,
} from '@/lib/email/templates';
import { accessRequestDigestStats } from '@/lib/workspace/accessRequests';

function utcDayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Send daily access-request digests for workspaces with pending or recent activity.
 */
export async function runAccessRequestDigests(): Promise<{
  workspacesConsidered: number;
  emailsSent: number;
  skipped: number;
}> {
  const all = await db.query.workspaces.findMany({
    columns: { id: true, name: true },
    limit: 5000,
  });

  let emailsSent = 0;
  let skipped = 0;

  const periodKey = utcDayKey();

  for (const ws of all) {
    const stats = await accessRequestDigestStats(ws.id);
    if (
      stats.pendingCount === 0 &&
      stats.newCount === 0 &&
      stats.rejectedCount === 0
    ) {
      skipped += 1;
      continue;
    }

    const already = await withTenant(ws.id, null, async (tx) => {
      return tx.query.emailNotifications.findFirst({
        where: and(
          eq(emailNotifications.workspaceId, ws.id),
          eq(emailNotifications.kind, 'access_request_digest'),
          eq(emailNotifications.periodKey, periodKey),
        ),
        columns: { id: true },
      });
    });
    if (already) {
      skipped += 1;
      continue;
    }

    const recipients = await listWorkspaceOwnerAdminEmails(ws.id);
    if (recipients.length === 0) {
      skipped += 1;
      continue;
    }

    const tpl = accessRequestDigestEmail({
      workspaceName: ws.name,
      pendingCount: stats.pendingCount,
      newCount: stats.newCount,
      rejectedCount: stats.rejectedCount,
      teamUrl: workspaceTeamUrl(),
    });

    const sent = await sendTransactionalEmail({
      to: recipients,
      subject: tpl.subject,
      text: tpl.text,
      html: tpl.html,
      tags: { kind: 'access_request_digest' },
    });

    if (!sent.ok || ('skipped' in sent && sent.skipped)) {
      skipped += 1;
      continue;
    }

    try {
      await withTenant(ws.id, null, async (tx) => {
        await tx.insert(emailNotifications).values({
          workspaceId: ws.id,
          kind: 'access_request_digest',
          periodKey,
          metadata: stats,
        });
      });
    } catch {
      // race
    }
    emailsSent += 1;
  }

  return {
    workspacesConsidered: all.length,
    emailsSent,
    skipped,
  };
}
