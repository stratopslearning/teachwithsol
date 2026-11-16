import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, readApiError } from '@/lib/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('applies the base path and passes init through', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/x', { method: 'DELETE' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.endsWith('/api/x')).toBe(true);
    expect(init.method).toBe('DELETE');
  });

  it('sends `json` as a JSON body', async () => {
    const fetchMock = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);
    await apiFetch('/api/x', { method: 'POST', json: { a: 1 } });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.body).toBe('{"a":1}');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });
});

describe('readApiError', () => {
  it('returns the API error message or the fallback', async () => {
    expect(await readApiError(new Response(JSON.stringify({ error: 'Nope' }), { status: 400 }))).toBe('Nope');
    expect(await readApiError(new Response('oops', { status: 500 }), 'Failed')).toBe('Failed');
  });
});
