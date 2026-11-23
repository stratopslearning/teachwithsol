import { describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@/app/db', () => ({ db: { execute: vi.fn(async () => ({ rows })) } }));

import { fetchAuthoringMessagesForOutline } from '@/lib/db/entityScopedReads';

describe('fetchAuthoringMessagesForOutline', () => {
  it('returns the latest messages oldest-first, user before assistant on ties', async () => {
    rows.length = 0;
    for (let turn = 0; turn < 30; turn++) {
      const at = new Date(Date.UTC(2026, 10, 1, 0, turn)).toISOString();
      // The definer may hand back a pair in either order.
      rows.push({ id: `a${turn}`, outline_id: 'o', role: 'assistant', content: `answer ${turn}`, created_at: at });
      rows.push({ id: `u${turn}`, outline_id: 'o', role: 'user', content: `ask ${turn}`, created_at: at });
    }
    const out = await fetchAuthoringMessagesForOutline('o', 4);
    expect(out.map((m) => m.content)).toEqual(['ask 28', 'answer 28', 'ask 29', 'answer 29']);
  });
});
