import { cache } from 'react';
import { auth, clerkClient } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/app/db';
import { users as dbUsers } from '@/app/db/schema';
import { readLoadTestUserId } from '@/lib/loadTestAuth';

/**
 * Next.js signals "this page must be dynamic" by throwing internal errors with
 * a `digest` like `DYNAMIC_SERVER_USAGE` or `NEXT_REDIRECT` during static
 * prerender. Those are control flow, not real failures, and the framework
 * expects them to bubble. Catching/logging them pollutes build output and can
 * also swallow `redirect()` from server helpers.
 */
function isNextInternalError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== 'string') return false;
  return (
    digest === 'DYNAMIC_SERVER_USAGE' ||
    digest === 'NEXT_NOT_FOUND' ||
    digest.startsWith('NEXT_REDIRECT')
  );
}

export interface UserData {
  id: string;
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  platformStaff: boolean;
  paid: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** The user fields authz checks need (id + Clerk id + staff flag). */
export type AuthUser = Pick<UserData, 'id' | 'clerkId'> & {
  platformStaff?: boolean | null;
};

/** Minimal authz caller: id + staff flag. */
export type AuthUserRef = Pick<UserData, 'id'> & {
  platformStaff?: boolean | null;
};

/** Public client payload: never includes stripeCustomerId / lastSyncedAt. */
export type PublicUserDto = Pick<
  UserData,
  'id' | 'platformStaff' | 'paid' | 'firstName' | 'lastName' | 'email'
>;

/** Platform staff = `users.platform_staff` (users.role was dropped). */
export function resolvePlatformStaff(row: {
  platformStaff?: boolean | null;
}): boolean {
  return Boolean(row.platformStaff);
}

export function toUserData(row: {
  id: string;
  clerkId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  platformStaff?: boolean | null;
  paid: boolean;
  createdAt: Date;
  updatedAt: Date;
  role?: string | null;
}): UserData {
  return {
    id: row.id,
    clerkId: row.clerkId,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    platformStaff: resolvePlatformStaff(row),
    paid: row.paid,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPublicUserDto(user: UserData): PublicUserDto {
  return {
    id: user.id,
    platformStaff: user.platformStaff,
    paid: user.paid,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}

/** Isolate TTL for successful UserData lookups. Safety net if a writer forgets invalidate. */
export const USER_CACHE_TTL_MS = 30_000;

type CachedUserEntry = { user: UserData; expiresAt: number };

const userCacheByClerkId = new Map<string, CachedUserEntry>();
const userCacheById = new Map<string, CachedUserEntry>();

function readFresh(entry: CachedUserEntry | undefined): UserData | undefined {
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    userCacheByClerkId.delete(entry.user.clerkId);
    userCacheById.delete(entry.user.id);
    return undefined;
  }
  return entry.user;
}

function rememberUser(user: UserData): void {
  const expiresAt = Date.now() + USER_CACHE_TTL_MS;
  const entry: CachedUserEntry = { user, expiresAt };
  userCacheByClerkId.set(user.clerkId, entry);
  userCacheById.set(user.id, entry);
}

function getCachedByClerkId(clerkId: string): UserData | undefined {
  return readFresh(userCacheByClerkId.get(clerkId));
}

function getCachedByUserId(userId: string): UserData | undefined {
  return readFresh(userCacheById.get(userId));
}

/**
 * Drop cached UserData. Pass nothing to clear the isolate maps (tests).
 * Call on any write to `paid` or `platformStaff`.
 */
export function invalidateUserCache(args: {
  clerkId?: string;
  userId?: string;
} = {}): void {
  if (!args.clerkId && !args.userId) {
    userCacheByClerkId.clear();
    userCacheById.clear();
    return;
  }
  if (args.clerkId) {
    const entry = userCacheByClerkId.get(args.clerkId);
    userCacheByClerkId.delete(args.clerkId);
    if (entry) userCacheById.delete(entry.user.id);
  }
  if (args.userId) {
    const entry = userCacheById.get(args.userId);
    userCacheById.delete(args.userId);
    if (entry) userCacheByClerkId.delete(entry.user.clerkId);
  }
}

/**
 * Gets or creates a user in the database based on Clerk authentication.
 * Syncs the Clerk userId / profile fields into our database for business logic.
 *
 * Implementation notes:
 *   - Lookup by `clerk_id` first (common path).
 *   - If missing, look up by email (case-insensitive) and **relink** the row to
 *     the current Clerk id. This repairs orphans after a Clerk user was deleted
 *     and recreated without creating a second SOL profile.
 *   - Insert uses `ON CONFLICT (clerk_id) DO UPDATE` for concurrent first logins.
 *   - Partial unique index on `lower(email)` prevents duplicate non-empty emails.
 *   - `paid` and `platformStaff` are NEVER overwritten on sync: admins / Stripe own those.
 *   - Workspace membership and scoped grants are the authority for what someone can do.
 */
/**
 * Staging k6 path: resolve a pre-seeded user from load-test headers.
 * Returns `undefined` when this is not a load-test request so callers fall
 * through to Clerk. Returns `null` when the headers are valid but the user
 * row is missing (never auto-create).
 */
async function lookupLoadTestUser(): Promise<UserData | null | undefined> {
  try {
    const headerBag = await headers();
    const userId = readLoadTestUserId(headerBag);
    if (!userId) return undefined;
    const cached = getCachedByUserId(userId);
    if (cached) return cached;
    const row = await db.query.users.findFirst({
      where: eq(dbUsers.id, userId),
    });
    if (!row) return null;
    const user = toUserData(row);
    rememberUser(user);
    return user;
  } catch (error) {
    if (isNextInternalError(error)) throw error;
    return undefined;
  }
}

async function getOrCreateUserImpl(): Promise<UserData | null> {
  try {
    const impersonated = await lookupLoadTestUser();
    if (impersonated !== undefined) return impersonated;

    const { userId } = await auth();
    if (!userId) return null;
    return await getOrCreateUserByClerkId(userId);
  } catch (error) {
    if (isNextInternalError(error)) throw error;
    console.error('Error in getOrCreateUser:', error);
    return null;
  }
}

export const getOrCreateUser = cache(getOrCreateUserImpl);

/**
 * Same upsert as `getOrCreateUser`, but for callers that already resolved the
 * Clerk user id themselves (e.g. the MCP OAuth bearer path, where there is no
 * Clerk session cookie. `auth({ acceptsToken: 'oauth_token' })` returns the
 * token subject instead).
 */
async function getOrCreateUserByClerkIdUncached(
  userId: string,
): Promise<UserData | null> {
  try {
    const cached = getCachedByClerkId(userId);
    if (cached) return cached;

    const existingUser = await db.query.users.findFirst({
      where: eq(dbUsers.clerkId, userId),
    });
    if (existingUser) {
      const user = toUserData(existingUser);
      rememberUser(user);
      return user;
    }

    let email = '';
    let firstName: string | null = null;
    let lastName: string | null = null;
    try {
      const clerk = await clerkClient();
      const clerkUser = await clerk.users.getUser(userId);
      email = clerkUser.emailAddresses?.[0]?.emailAddress || '';
      firstName = clerkUser.firstName || null;
      lastName = clerkUser.lastName || null;
    } catch (e) {
      console.warn('Failed to fetch Clerk user profile during sync', e);
    }

    // Relink orphan row that already owns this email under a stale clerk_id.
    if (email) {
      const byEmail = await db.query.users.findFirst({
        where: sql`lower(${dbUsers.email}) = ${email.toLowerCase()}`,
      });
      if (byEmail) {
        invalidateUserCache({ clerkId: byEmail.clerkId, userId: byEmail.id });
        const [relinked] = await db
          .update(dbUsers)
          .set({
            clerkId: userId,
            email,
            firstName: firstName ?? byEmail.firstName,
            lastName: lastName ?? byEmail.lastName,
            lastSyncedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(dbUsers.id, byEmail.id))
          .returning();
        const user = toUserData(relinked);
        rememberUser(user);
        return user;
      }
    }

    const [upserted] = await db
      .insert(dbUsers)
      .values({
        clerkId: userId,
        email,
        firstName,
        lastName,
        paid: false,
        lastSyncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: dbUsers.clerkId,
        set: {
          email,
          firstName,
          lastName,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    const user = toUserData(upserted);
    rememberUser(user);
    return user;
  } catch (error) {
    if (isNextInternalError(error)) throw error;
    console.error('Error in getOrCreateUserByClerkId:', error);
    return null;
  }
}

export const getOrCreateUserByClerkId = cache(getOrCreateUserByClerkIdUncached);

/**
 * Gets user data without creating if not exists
 */
async function getUserImpl(): Promise<UserData | null> {
  try {
    const impersonated = await lookupLoadTestUser();
    if (impersonated !== undefined) return impersonated;

    const { userId } = await auth();
    if (!userId) return null;
    const cached = getCachedByClerkId(userId);
    if (cached) return cached;
    const user = await db.query.users.findFirst({
      where: eq(dbUsers.clerkId, userId),
    });
    if (!user) return null;
    const data = toUserData(user);
    rememberUser(data);
    return data;
  } catch (error) {
    if (isNextInternalError(error)) throw error;
    console.error('Error in getUser:', error);
    return null;
  }
}

export const getUser = cache(getUserImpl);

/**
 * Fresh DB read of paid/platformStaff for entitlement checks.
 * Bypasses the isolate TTL cache so Stripe/admin updates are visible across
 * warm Lambdas without waiting for USER_CACHE_TTL_MS.
 */
export async function refreshUserEntitlements(
  user: UserData,
): Promise<UserData> {
  const row = await db.query.users.findFirst({
    where: eq(dbUsers.id, user.id),
    columns: { id: true, paid: true, platformStaff: true },
  });
  if (!row) return user;
  const platformStaff = resolvePlatformStaff(row);
  if (row.paid === user.paid && platformStaff === user.platformStaff) {
    return user;
  }
  const next: UserData = {
    ...user,
    paid: row.paid,
    platformStaff,
  };
  invalidateUserCache({ clerkId: user.clerkId, userId: user.id });
  rememberUser(next);
  return next;
}

/**
 * Updates user data in the database
 */
export async function updateUser(
  updates: Partial<
    Pick<UserData, 'paid' | 'firstName' | 'lastName' | 'platformStaff'>
  >,
): Promise<UserData | null> {
  try {
    const { userId } = await auth();
    if (!userId) return null;
    const [updatedUser] = await db
      .update(dbUsers)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(dbUsers.clerkId, userId))
      .returning();
    if (!updatedUser) return null;
    const user = toUserData(updatedUser);
    invalidateUserCache({ clerkId: user.clerkId, userId: user.id });
    rememberUser(user);
    return user;
  } catch (error) {
    if (isNextInternalError(error)) throw error;
    console.error('Error in updateUser:', error);
    return null;
  }
}
