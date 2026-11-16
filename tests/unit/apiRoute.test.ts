import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const m = vi.hoisted(() => ({
  teaching: true,
  manage: vi.fn(async (_u: unknown, _c: string) => {}),
}));
vi.mock('@/lib/getOrCreateUser', () => ({
  getOrCreateUser: async () => ({ id: 'u1', paid: true, platformStaff: false }),
  refreshUserEntitlements: async (u: unknown) => u,
}));
vi.mock('@/lib/authz/gates', () => ({
  userCanAccessTeachingArea: async () => m.teaching,
  userCanAccessLearningArea: async () => !m.teaching,
}));
vi.mock('@/lib/featureFlags', () => ({ paymentsEnabled: () => false }));
vi.mock('@/lib/knowledge/access', () => ({ assertCanManageCourse: m.manage }));

import { ApiError } from '@/lib/api/errors';
import { route } from '@/lib/api/route';

const json = (body: unknown) =>
  new NextRequest('http://localhost/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const ctx = <P extends Record<string, string>>(p: P) => ({ params: Promise.resolve(p) });

beforeEach(() => {
  m.teaching = true;
  m.manage.mockReset();
});

describe('route()', () => {
  const schema = z.object({ title: z.string() });
  const handler = route<{ courseId: string }, typeof schema>(
    { auth: 'manageCourse', body: schema },
    async ({ body, params, user }) =>
      NextResponse.json({ title: body.title, courseId: params.courseId, user: user.id }),
  );

  it('authenticates, checks the course, parses the body', async () => {
    const res = await handler(json({ title: 'Hi' }), ctx({ courseId: 'c1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ title: 'Hi', courseId: 'c1', user: 'u1' });
    expect(m.manage).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }), 'c1');
  });

  it('rejects an invalid body with 400 and the standard error shape', async () => {
    const res = await handler(json({ title: 5 }), ctx({ courseId: 'c1' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Validation error', code: 'bad_request' });
  });

  it('returns 403 when the caller cannot manage the course', async () => {
    m.manage.mockRejectedValueOnce(ApiError.forbidden());
    const res = await handler(json({ title: 'Hi' }), ctx({ courseId: 'c1' }));
    expect(res.status).toBe(403);
  });

  it('returns 403 for a non-teacher before touching the course', async () => {
    m.teaching = false;
    const res = await handler(json({ title: 'Hi' }), ctx({ courseId: 'c1' }));
    expect(res.status).toBe(403);
    expect(m.manage).not.toHaveBeenCalled();
  });

  it('maps unexpected errors to a 500 without leaking details', async () => {
    const boom = route({ auth: 'user' }, async () => {
      throw new Error('secret detail');
    });
    const res = await boom(json({}), ctx({}));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain('secret detail');
  });
});
