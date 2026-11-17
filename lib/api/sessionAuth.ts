/**
 * Session (Clerk) auth for API routes. Same rules as the page gates in
 * `lib/authz/gates.ts` / `lib/auth.ts`, but failures throw `ApiError`
 * (401/402/403) instead of redirecting, so `apiErrorResponse` returns the
 * right status. Use these in `app/api/**`; never the page gates.
 *
 * Personal access tokens are deliberately not accepted here — routes that
 * should accept them use `requireProfessorApi`.
 */
import { ApiError } from '@/lib/api/errors';
import {
  userCanAccessLearningArea,
  userCanAccessTeachingArea,
} from '@/lib/authz/gates';
import { isStudentEntitled, paymentsEnabled } from '@/lib/featureFlags';
import {
  getOrCreateUser,
  refreshUserEntitlements,
  type UserData,
} from '@/lib/getOrCreateUser';

export async function requireApiUser(): Promise<UserData> {
  const user = await getOrCreateUser();
  if (!user) throw ApiError.unauthorized();
  return user;
}

/** Caller must hold a teaching binding (mirrors `requireTeachingAccess`). */
export async function requireTeachingApi(): Promise<UserData> {
  const user = await requireApiUser();
  if (!(await userCanAccessTeachingArea(user.id))) throw ApiError.forbidden();
  return user;
}

/**
 * Caller must be platform staff (mirrors `requirePlatformStaff`). Tenant data
 * still needs `requireSupportGrant(user, tenantId)` on top.
 */
export async function requirePlatformStaffApi(): Promise<UserData> {
  const user = await requireApiUser();
  if (!user.platformStaff) throw ApiError.forbidden();
  return user;
}

/**
 * Caller must be a learner (mirrors `requireStudent`): first-time learners
 * with no enrollments are allowed unless they only hold teaching bindings,
 * and unpaid learners are rejected when payments are enabled.
 */
export async function requireLearnerApi(): Promise<UserData> {
  const user = await requireApiUser();
  const [learning, teaching] = await Promise.all([
    userCanAccessLearningArea(user.id),
    userCanAccessTeachingArea(user.id),
  ]);
  if (!learning && teaching) throw ApiError.forbidden();

  const refreshed = await refreshUserEntitlements(user);
  if (paymentsEnabled() && learning && !teaching && !refreshed.paid) {
    throw ApiError.paymentRequired();
  }
  return refreshed;
}

/** Signed in and allowed into the learning area (no payment check). */
export async function requireLearningAreaApi(): Promise<UserData> {
  const user = await requireApiUser();
  if (!(await userCanAccessLearningArea(user.id))) throw ApiError.forbidden();
  return user;
}

/** Learning area + student entitlement (402 when payment is required). */
export async function requireEntitledLearnerApi(): Promise<UserData> {
  const user = await requireLearningAreaApi();
  if (!isStudentEntitled(user)) throw ApiError.paymentRequired();
  return user;
}
