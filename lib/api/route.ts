/**
 * One way to write an API route handler:
 *
 *   export const POST = route(
 *     { auth: 'manageCourse', body: schema },
 *     async ({ user, body, params }) => NextResponse.json(...),
 *   );
 *
 * - `auth` runs first and throws ApiError (401/402/403) on failure.
 * - `body` (a zod schema) is read with readJsonBody and validated (400).
 * - Every thrown error goes through apiErrorResponse, so the error shape is
 *   always `{ error, code }` and Next redirects/notFound still work.
 */
import type { NextRequest } from 'next/server';
import type { z } from 'zod';

import { apiErrorResponse } from '@/lib/api/errors';
import { requireProfessorApi, type ProfessorApiAuth } from '@/lib/api/professorAuth';
import { readJsonBody } from '@/lib/api/readJsonBody';
import {
  requireApiUser,
  requireEntitledLearnerApi,
  requireLearnerApi,
  requireLearningAreaApi,
  requirePlatformStaffApi,
  requireTeachingApi,
} from '@/lib/api/sessionAuth';
import type { UserData } from '@/lib/getOrCreateUser';
import type { TokenScope } from '@/lib/professorApiTokens';
import { assertCanManageCourse } from '@/lib/knowledge/access';

/**
 * - `user`: any signed-in user
 * - `teaching`: holds a teaching binding
 * - `learner`: learner (payment gate applies)
 * - `learningArea`: signed in and allowed into the learning area
 * - `entitledLearner`: learningArea + student entitlement (402 if unpaid)
 * - `staff`: platform staff (tenant data still needs requireSupportGrant)
 * - `manageCourse`: teaching + may manage `params.courseId`
 * - `{ professorApi }`: teaching staff via session, personal access token or
 *   OAuth token, with an optional token scope (requireProfessorApi)
 * - `public`: no session; the handler verifies its caller itself
 *   (webhook signature, CRON_SECRET, LTI JWT). `user` is null.
 */
export type RouteAuth =
  | 'user'
  | 'teaching'
  | 'learner'
  | 'learningArea'
  | 'entitledLearner'
  | 'staff'
  | 'manageCourse'
  | 'public'
  | { professorApi: TokenScope | null; professorOnly?: boolean };

type UserFor<A> = A extends 'public' ? null : UserData;

type Params = Record<string, string>;

export type RouteContext<P extends Params, B, A extends RouteAuth = RouteAuth> = {
  req: NextRequest;
  params: P;
  user: UserFor<A>;
  body: B;
  /** Token details for `{ professorApi }` routes (null otherwise). */
  apiAuth: ProfessorApiAuth | null;
};

export type RouteOptions<S extends z.ZodTypeAny | undefined, A extends RouteAuth = RouteAuth> = {
  auth: A;
  body?: S;
  maxBodyBytes?: number;
};

type BodyOf<S> = S extends z.ZodTypeAny ? z.infer<S> : undefined;

async function authenticate(
  req: NextRequest,
  auth: RouteAuth,
  params: Params,
): Promise<{ user: UserData | null; apiAuth: ProfessorApiAuth | null }> {
  if (auth === 'public') return { user: null, apiAuth: null };
  if (typeof auth === 'object') {
    const apiAuth = await requireProfessorApi(req, {
      scope: auth.professorApi ?? undefined,
      professorOnly: auth.professorOnly,
    });
    return { user: apiAuth.user, apiAuth };
  }
  return { user: await authenticateSession(auth, params), apiAuth: null };
}

async function authenticateSession(
  auth: Exclude<RouteAuth, 'public' | object>,
  params: Params,
): Promise<UserData> {
  switch (auth) {
    case 'user':
      return requireApiUser();
    case 'teaching':
      return requireTeachingApi();
    case 'learner':
      return requireLearnerApi();
    case 'learningArea':
      return requireLearningAreaApi();
    case 'entitledLearner':
      return requireEntitledLearnerApi();
    case 'staff':
      return requirePlatformStaffApi();
    case 'manageCourse': {
      const user = await requireTeachingApi();
      await assertCanManageCourse(user, params.courseId);
      return user;
    }
  }
}

export function route<
  P extends Params = Params,
  S extends z.ZodTypeAny | undefined = undefined,
  // Routes that pass explicit type args get a signed-in user by default;
  // public routes let the auth mode be inferred.
  A extends RouteAuth = Exclude<RouteAuth, 'public'>,
>(
  opts: RouteOptions<S, A>,
  handler: (ctx: RouteContext<P, BodyOf<S>, A>) => Promise<Response>,
) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<P> },
  ): Promise<Response> => {
    try {
      const params = (await ctx.params) ?? ({} as P);
      const { user, apiAuth } = await authenticate(req, opts.auth, params);
      const body = (
        opts.body
          ? opts.body.parse(await readJsonBody(req, { maxBytes: opts.maxBodyBytes }))
          : undefined
      ) as BodyOf<S>;
      return await handler({ req, params, user: user as UserFor<A>, body, apiAuth });
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
