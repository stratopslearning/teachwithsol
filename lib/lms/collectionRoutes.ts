/**
 * GET (list) + POST (upsert) handlers for the simple per-course LMS
 * collections (pages, outcomes, rubrics, assignment groups, discussions).
 * The upsert payload is passed through to the SECURITY DEFINER function,
 * which owns the field validation.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { route } from '@/lib/api/route';

const payload = z.object({}).passthrough();

export function lmsCollectionRoutes<T>(opts: {
  /** Response key for both the list and the single upserted row. */
  listKey: string;
  itemKey: string;
  list: (courseId: string) => Promise<T[]>;
  upsert: (payload: Record<string, unknown>) => Promise<unknown>;
  /** Stamp the caller as creator (createdByUserId). */
  stampCreator?: boolean;
}) {
  type P = { courseId: string };
  return {
    GET: route<P>({ auth: 'manageCourse' }, async ({ params }) =>
      NextResponse.json({ [opts.listKey]: await opts.list(params.courseId) }),
    ),
    POST: route<P, typeof payload>(
      { auth: 'manageCourse', body: payload },
      async ({ params, body, user }) =>
        NextResponse.json({
          [opts.itemKey]: await opts.upsert({
            ...body,
            courseId: params.courseId,
            ...(opts.stampCreator ? { createdByUserId: user.id } : {}),
          }),
        }),
    ),
  };
}
