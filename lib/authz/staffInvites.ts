import { createHash, randomBytes } from 'crypto';
import { sql } from 'drizzle-orm';

import { db } from '@/app/db';
import {
  grantSectionStaff,
  type SectionStaffInviteRole,
} from '@/lib/authz/staffGrants';
import { withBasePath } from '@/lib/basePath';

const STAFF_INVITE_ROLES: SectionStaffInviteRole[] = [
  'co_instructor',
  'ta',
  'grader',
];

export function isSectionStaffInviteRole(
  role: string,
): role is SectionStaffInviteRole {
  return STAFF_INVITE_ROLES.includes(role as SectionStaffInviteRole);
}

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function mintToken(): string {
  return randomBytes(32).toString('base64url');
}

function buildClaimUrl(token: string, baseUrl?: string): string {
  const path = withBasePath(
    `/staff/claim?token=${encodeURIComponent(token)}`,
  );
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

type StaffInviteRow = {
  id: string;
  tenant_id: string;
  section_id: string;
  email: string;
  role: string;
  token_hash: string;
  granted_by: string | null;
  expires_at: Date;
  claimed_at: Date | null;
  claimed_by_user_id: string | null;
  created_at: Date;
};

function rowsFromExecute<T>(result: unknown): T[] {
  return (
    (result as { rows?: T[] }).rows ??
    (Array.isArray(result) ? (result as T[]) : [])
  );
}

export async function createSectionStaffInvite(opts: {
  tenantId: string;
  sectionId: string;
  email: string;
  role: SectionStaffInviteRole;
  grantedBy: string;
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

  const { createStaffInviteDefiner } = await import(
    '@/lib/db/tenantWriteDefiners'
  );
  const invite = await createStaffInviteDefiner({
    tenantId: opts.tenantId,
    sectionId: opts.sectionId,
    email,
    role: opts.role,
    tokenHash,
    grantedBy: opts.grantedBy,
    expiresAt: expiresAt.toISOString(),
  });

  return {
    inviteId: invite.id,
    token,
    claimUrl: buildClaimUrl(token, opts.baseUrl),
    expiresAt: invite.expiresAt,
  };
}

export async function claimSectionStaffInvite(opts: {
  token: string;
  user: { id: string; email: string };
}): Promise<
  | {
      ok: true;
      sectionId: string;
      role: SectionStaffInviteRole;
      tenantId: string;
    }
  | { ok: false; error: string; status: 400 | 403 | 404 | 410 }
> {
  const tokenHash = hashToken(opts.token);
  const found = rowsFromExecute<StaffInviteRow>(
    await db.execute(
      sql`SELECT * FROM sol_find_staff_invite_by_token(${tokenHash})`,
    ),
  )[0];
  if (!found) return { ok: false, error: 'Invite not found', status: 404 };
  if (found.claimed_at) {
    return { ok: false, error: 'Invite already claimed', status: 410 };
  }
  if (new Date(found.expires_at).getTime() < Date.now()) {
    return { ok: false, error: 'Invite expired', status: 410 };
  }
  const sessionEmail = opts.user.email.trim().toLowerCase();
  if (!sessionEmail || sessionEmail !== found.email.toLowerCase()) {
    return {
      ok: false,
      error: 'Sign in with the invited email address to claim this invite',
      status: 403,
    };
  }

  const claimed = rowsFromExecute<{
    id: string;
    tenant_id: string;
    section_id: string;
    email: string;
    role: string;
    granted_by: string | null;
    expires_at: Date;
  }>(
    await db.execute(
      sql`SELECT * FROM sol_claim_staff_invite(${tokenHash}, ${opts.user.id}::uuid)`,
    ),
  )[0];
  if (!claimed) {
    return { ok: false, error: 'Invite already claimed', status: 410 };
  }

  if (!isSectionStaffInviteRole(claimed.role)) {
    return { ok: false, error: 'Invite role is invalid', status: 400 };
  }

  await grantSectionStaff({
    tenantId: claimed.tenant_id,
    userId: opts.user.id,
    sectionId: claimed.section_id,
    role: claimed.role,
    grantedBy: claimed.granted_by,
    ensureSeat: true,
  });

  return {
    ok: true,
    sectionId: claimed.section_id,
    role: claimed.role,
    tenantId: claimed.tenant_id,
  };
}
