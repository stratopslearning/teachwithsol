import { clerkClient } from '@clerk/nextjs/server';
import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { ltiUserLinks, users } from '@/app/db/schema';
import {
  invalidateUserCache,
  toUserData,
  type UserData,
} from '@/lib/getOrCreateUser';
import {
  mapLtiRolesToSolHint,
  type LtiSolRoleHint,
} from '@/lib/lti/roles';

function splitName(claims: {
  name?: string;
  given_name?: string;
  family_name?: string;
}): { firstName: string | null; lastName: string | null } {
  if (claims.given_name || claims.family_name) {
    return {
      firstName: claims.given_name?.trim() || null,
      lastName: claims.family_name?.trim() || null,
    };
  }
  const name = claims.name?.trim();
  if (!name) return { firstName: null, lastName: null };
  const parts = name.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: null };
  return {
    firstName: parts[0]!,
    lastName: parts.slice(1).join(' '),
  };
}

/**
 * Resolve or create SOL + Clerk user from LTI launch claims.
 * Never overwrites existing role/paid (same contract as Clerk sync).
 * Role hint only applies when creating a brand-new SOL user.
 */
export async function resolveOrCreateLtiUser(opts: {
  platformId: string;
  /** The platform's tenant; user links are stamped with it (FORCE RLS). */
  tenantId: string;
  ltiUserId: string;
  email: string | null | undefined;
  claims: {
    name?: string;
    given_name?: string;
    family_name?: string;
  };
  roles: string[];
}): Promise<{ user: UserData; roleHint: LtiSolRoleHint; created: boolean }> {
  const roleHint = mapLtiRolesToSolHint(opts.roles);
  const email = opts.email?.trim().toLowerCase() || '';
  const { firstName, lastName } = splitName(opts.claims);

  const existingLink = await db.query.ltiUserLinks.findFirst({
    where: and(
      eq(ltiUserLinks.platformId, opts.platformId),
      eq(ltiUserLinks.ltiUserId, opts.ltiUserId),
    ),
  });

  if (existingLink) {
    const row = await db.query.users.findFirst({
      where: eq(users.id, existingLink.userId),
    });
    if (row) {
      if (email && row.email !== email) {
        await db
          .update(ltiUserLinks)
          .set({ emailSnapshot: email, updatedAt: new Date() })
          .where(eq(ltiUserLinks.id, existingLink.id));
      }
      return { user: toUserData(row), roleHint, created: false };
    }
  }

  let userRow =
    email.length > 0
      ? await db.query.users.findFirst({
          where: sql`lower(${users.email}) = ${email}`,
        })
      : undefined;

  let created = false;
  const client = await clerkClient();

  if (!userRow) {
    let clerkUser;
    if (email) {
      const found = await client.users.getUserList({
        emailAddress: [email],
        limit: 1,
      });
      clerkUser = found.data[0];
    }

    if (!clerkUser) {
      clerkUser = await client.users.createUser({
        emailAddress: email ? [email] : undefined,
        firstName: firstName ?? undefined,
        lastName: lastName ?? undefined,
        skipPasswordRequirement: true,
        skipPasswordChecks: true,
        externalId: `lti:${opts.platformId}:${opts.ltiUserId}`,
      });
    }

    const [inserted] = await db
      .insert(users)
      .values({
        clerkId: clerkUser.id,
        email: email || `lti-${opts.ltiUserId}@users.invalid`,
        firstName,
        lastName,
        paid: false,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          email: email || `lti-${opts.ltiUserId}@users.invalid`,
          firstName,
          lastName,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    userRow = inserted;
    created = true;
    invalidateUserCache({ clerkId: userRow.clerkId, userId: userRow.id });
  }

  await db
    .insert(ltiUserLinks)
    .values({
      userId: userRow.id,
      platformId: opts.platformId,
      tenantId: opts.tenantId,
      ltiUserId: opts.ltiUserId,
      emailSnapshot: email || null,
    })
    .onConflictDoUpdate({
      target: [ltiUserLinks.platformId, ltiUserLinks.ltiUserId],
      set: {
        userId: userRow.id,
        emailSnapshot: email || null,
        updatedAt: new Date(),
      },
    });

  return { user: toUserData(userRow), roleHint, created };
}

/** Create a short-lived Clerk sign-in ticket for post-LTI browser session. */
export async function createClerkSignInTicket(clerkUserId: string): Promise<string> {
  const client = await clerkClient();
  const token = await client.signInTokens.createSignInToken({
    userId: clerkUserId,
    expiresInSeconds: 300,
  });
  return token.token;
}
