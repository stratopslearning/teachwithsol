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
import { readJsonBody } from '@/lib/api/readJsonBody';
import {
  requireApiUser,
  requireLearnerApi,
  requirePlatformStaffApi,
  requireTeachingApi,
} from '@/lib/api/sessionAuth';
import type { UserData } from '@/lib/getOrCreateUser';
import { assertCanManageCourse } from '@/lib/knowledge/access';

/**
 * - `user`: any signed-in user
 * - `teaching`: holds a teaching binding
 * - `learner`: learner (payment gate applies)
 * - `staff`: platform staff (tenant data still needs requireSupportGrant)
 * - `manageCourse`: teaching + may manage `params.courseId`
 */
export type RouteAuth = 'user' | 'teaching' | 'learner' | 'staff' | 'manageCourse';

type Params = Record<string, string>;

export type RouteContext<P extends Params, B> = {
  req: NextRequest;
  params: P;
  user: UserData;
  body: B;
};

export type RouteOptions<S extends z.ZodTypeAny | undefined> = {
  auth: RouteAuth;
  body?: S;
  maxBodyBytes?: number;
};

type BodyOf<S> = S extends z.ZodTypeAny ? z.infer<S> : undefined;

async function authenticate(auth: RouteAuth, params: Params): Promise<UserData> {
  switch (auth) {
    case 'user':
      return requireApiUser();
    case 'teaching':
      return requireTeachingApi();
    case 'learner':
      return requireLearnerApi();
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
>(
  opts: RouteOptions<S>,
  handler: (ctx: RouteContext<P, BodyOf<S>>) => Promise<Response>,
) {
  return async (
    req: NextRequest,
    ctx: { params: Promise<P> },
  ): Promise<Response> => {
    try {
      const params = (await ctx.params) ?? ({} as P);
      const user = await authenticate(opts.auth, params);
      const body = (
        opts.body
          ? opts.body.parse(await readJsonBody(req, { maxBytes: opts.maxBodyBytes }))
          : undefined
      ) as BodyOf<S>;
      return await handler({ req, params, user, body });
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
