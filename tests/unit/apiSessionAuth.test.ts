import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression: API routes used the page gates (which redirect). The redirect
// was caught by `apiErrorResponse` and returned as a logged 500 instead of
// 401/403. Stub the user, bindings and DB so only the auth path runs.

type Caller = { teaching: boolean; learning: boolean; paid: boolean } | null;
const state = vi.hoisted(() => ({ caller: null as Caller, payments: false }));

vi.mock('@/lib/getOrCreateUser', () => ({
  getOrCreateUser: async () => (state.caller ? { id: 'u1', paid: state.caller.paid } : null),
  refreshUserEntitlements: async (u: unknown) => u,
}));
vi.mock('@/lib/authz/gates', () => ({
  userCanAccessTeachingArea: async () => Boolean(state.caller?.teaching),
  userCanAccessLearningArea: async () => Boolean(state.caller?.learning),
}));
vi.mock('@/lib/featureFlags', () => ({ paymentsEnabled: () => state.payments }));

const { updateSettings, markComplete } = vi.hoisted(() => ({
  updateSettings: vi.fn(async () => ({ ok: true })),
  markComplete: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@/lib/db/lmsDefiners', () => ({
  updateCourseLmsSettingsDefiner: updateSettings,
}));
vi.mock('@/lib/knowledge/access', () => ({ assertCanManageCourse: async () => {} }));
vi.mock('@/lib/lms/modules', () => ({ markModuleItemComplete: markComplete }));

import { PATCH as patchSettings } from '@/app/api/lms/courses/[courseId]/settings/route';
import { POST as completeItem } from '@/app/api/lms/module-items/[itemId]/complete/route';
import { apiErrorResponse } from '@/lib/api/errors';

function settingsReq() {
  return new NextRequest('http://localhost/api/lms/courses/c1/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ syllabusMarkdown: 'hi' }),
  });
}
const courseCtx = { params: Promise.resolve({ courseId: 'c1' }) };

beforeEach(() => {
  state.caller = null;
  state.payments = false;
  updateSettings.mockClear();
  markComplete.mockClear();
});

describe('teaching API routes', () => {
  it('returns 401 without a session', async () => {
    const res = await patchSettings(settingsReq(), courseCtx);
    expect(res.status).toBe(401);
  });

  it('returns 403 (not 500) for a student', async () => {
    state.caller = { teaching: false, learning: true, paid: true };
    const res = await patchSettings(settingsReq(), courseCtx);
    expect(res.status).toBe(403);
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('lets a teacher through', async () => {
    state.caller = { teaching: true, learning: false, paid: false };
    const res = await patchSettings(settingsReq(), courseCtx);
    expect(res.status).toBe(200);
    expect(updateSettings).toHaveBeenCalledOnce();
  });
});

describe('learner API routes', () => {
  const req = () =>
    new NextRequest('http://localhost/api/lms/module-items/i1/complete', {
      method: 'POST',
    });
  const ctx = { params: Promise.resolve({ itemId: 'i1' }) };

  it('returns 403 for a teaching-only user', async () => {
    state.caller = { teaching: true, learning: false, paid: false };
    const res = await completeItem(req(), ctx);
    expect(res.status).toBe(403);
  });

  it('returns 402 for an unpaid learner when payments are on', async () => {
    state.caller = { teaching: false, learning: true, paid: false };
    state.payments = true;
    const res = await completeItem(req(), ctx);
    expect(res.status).toBe(402);
  });

  it('allows a first-time learner with no enrollments', async () => {
    state.caller = { teaching: false, learning: false, paid: false };
    const res = await completeItem(req(), ctx);
    expect(res.status).not.toBe(403);
    expect(res.status).toBeLessThan(500);
  });
});

describe('apiErrorResponse', () => {
  it('rethrows Next redirects instead of returning 500', () => {
    let thrown: unknown;
    try {
      redirect('/login');
    } catch (err) {
      thrown = err;
    }
    expect(() => apiErrorResponse(thrown)).toThrow();
  });
});
