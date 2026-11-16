import { createHash, randomBytes } from 'crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { sectionStudentInvites, sections } from '@/app/db/schema';
import { withBasePath } from '@/lib/basePath';
import { withTenant } from '@/lib/db/tenantContext';
import { activeOnly } from '@/lib/db/filters';
import { upsertStudentEnrollment } from '@/lib/enrollment/sources';
import { rowsFromExecute } from '@/lib/db/rows';

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

function buildClaimUrl(token: string, baseUrl?: string): string {
  const path = withBasePath(
    `/student/claim?token=${encodeURIComponent(token)}`,
  );
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

type InviteRow = {
  id: string;
  tenant_id: string;
  section_id: string;
  email: string;
  token_hash: string;
  invited_by: string | null;
  expires_at: Date;
  claimed_at: Date | null;
  claimed_by_user_id: string | null;
  created_at: Date;
};

export async function createSectionStudentInvite(opts: {
  tenantId: string;
  sectionId: string;
  email: string;
  invitedBy: string;
  baseUrl?: string;
}): Promise<{
  inviteId: string;
  token: string;
  claimUrl: string;
  expiresAt: Date;
}> {
  const email = opts.email.trim().toLowerCase();
  const token = mintToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const { createStudentInviteDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  const invite = await createStudentInviteDefiner({
    tenantId: opts.tenantId,
    sectionId: opts.sectionId,
    email,
    tokenHash,
    invitedBy: opts.invitedBy,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    inviteId: invite.id,
    token,
    claimUrl: buildClaimUrl(token, opts.baseUrl),
    expiresAt: invite.expiresAt,
  };
}

export type StudentInvitePeek =
  | {
      ok: true;
      email: string;
      sectionId: string;
      tenantId: string;
      claimed: boolean;
      expired: boolean;
      expiresAt: Date;
    }
  | { ok: false; error: string; status: 404 };

/** Read-only lookup for the claim UI (does not mark claimed). */
export async function peekSectionStudentInvite(
  token: string,
): Promise<StudentInvitePeek> {
  const tokenHash = hashToken(token);
  const found = rowsFromExecute<InviteRow>(
    await db.execute(
      sql`SELECT * FROM sol_find_student_invite_by_token(${tokenHash})`,
    ),
  )[0];
  if (!found) return { ok: false, error: 'Invite not found', status: 404 };
  return {
    ok: true,
    email: found.email,
    sectionId: found.section_id,
    tenantId: found.tenant_id,
    claimed: Boolean(found.claimed_at),
    expired: new Date(found.expires_at).getTime() < Date.now(),
    expiresAt: new Date(found.expires_at),
  };
}

export async function claimSectionStudentInvite(opts: {
  token: string;
  user: { id: string; email: string };
}): Promise<
  | { ok: true; sectionId: string; tenantId: string }
  | { ok: false; error: string; status: 400 | 403 | 404 | 410 }
> {
  const peek = await peekSectionStudentInvite(opts.token);
  if (!peek.ok) return peek;
  if (peek.claimed) {
    return { ok: false, error: 'Invite already claimed', status: 410 };
  }
  if (peek.expired) {
    return { ok: false, error: 'Invite expired', status: 410 };
  }
  const sessionEmail = opts.user.email.trim().toLowerCase();
  if (!sessionEmail || sessionEmail !== peek.email.toLowerCase()) {
    return {
      ok: false,
      error: 'Sign in with the invited email address to claim this invite',
      status: 403,
    };
  }

  const tokenHash = hashToken(opts.token);
  const claimed = rowsFromExecute<{
    id: string;
    tenant_id: string;
    section_id: string;
    email: string;
    expires_at: Date;
  }>(
    await db.execute(
      sql`SELECT * FROM sol_claim_student_invite(${tokenHash}, ${opts.user.id}::uuid)`,
    ),
  )[0];
  if (!claimed) {
    return { ok: false, error: 'Invite already claimed', status: 410 };
  }

  const section = await withTenant(
    claimed.tenant_id,
    opts.user.id,
    async (tx) => {
      return tx.query.sections.findFirst({
        where: and(
          eq(sections.id, claimed.section_id),
          activeOnly(sections.deletedAt),
        ),
        columns: { id: true, offeringId: true },
      });
    },
  );
  if (!section) {
    return { ok: false, error: 'Section not found', status: 404 };
  }

  await upsertStudentEnrollment({
    studentId: opts.user.id,
    sectionId: claimed.section_id,
    source: 'invite',
    tenantId: claimed.tenant_id,
    offeringId: section.offeringId,
  });

  return {
    ok: true,
    sectionId: claimed.section_id,
    tenantId: claimed.tenant_id,
  };
}
