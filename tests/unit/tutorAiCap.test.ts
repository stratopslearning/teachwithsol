import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  workspace: vi.fn(async () => 'ws-1'),
  cap: vi.fn(async () => ({ ok: true }) as unknown),
}));
vi.mock('@/lib/workspace/access', () => ({ getCourseWorkspaceId: m.workspace }));
vi.mock('@/lib/workspace/aiCapGuard', () => ({ checkAiBandAvailable: m.cap }));

import { tutorAiCapBlock } from '@/lib/chatbot/aiCap';

beforeEach(() => {
  m.workspace.mockClear();
  m.cap.mockReset();
  m.cap.mockResolvedValue({ ok: true });
});

describe('tutorAiCapBlock', () => {
  it('allows the call when the band has room', async () => {
    expect(await tutorAiCapBlock('course-1')).toBeNull();
    expect(m.cap).toHaveBeenCalledWith('ws-1');
  });

  it('returns 429 when the band is exhausted', async () => {
    m.cap.mockResolvedValue({ ok: false, reason: 'Cap reached', used: 10, cap: 10 });
    const res = await tutorAiCapBlock('course-1');
    expect(res?.status).toBe(429);
    expect(await res?.json()).toMatchObject({ code: 'ai_band_exceeded', used: 10 });
  });

  it('fails closed (503) when the cap check throws', async () => {
    m.cap.mockRejectedValue(new Error('db down'));
    const res = await tutorAiCapBlock('course-1');
    expect(res?.status).toBe(503);
  });

  it('skips the check when the session has no course', async () => {
    expect(await tutorAiCapBlock(null)).toBeNull();
    expect(m.cap).not.toHaveBeenCalled();
  });
});
