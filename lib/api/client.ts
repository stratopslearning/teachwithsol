/**
 * Browser-side helpers for calling this app's API routes.
 *
 * Always use these instead of `fetch('/api/...')` or `fetch(apiUrl(...))`:
 * the app may run under a base path (e.g. /learning), and API errors share
 * one shape (`{ error, code }` from apiErrorResponse).
 */
import { apiUrl } from '@/lib/basePath';

export type ApiFetchInit = RequestInit & {
  /** Sent as a JSON body with `Content-Type: application/json`. */
  json?: unknown;
};

/** `fetch` for an app API path ("/api/..."), with the base path applied. */
export function apiFetch(path: string, init: ApiFetchInit = {}): Promise<Response> {
  const { json, headers, ...rest } = init;
  const url = apiUrl(path);
  if (json === undefined) return fetch(url, { ...rest, headers });
  const merged = new Headers(headers);
  if (!merged.has('Content-Type')) merged.set('Content-Type', 'application/json');
  return fetch(url, { ...rest, headers: merged, body: JSON.stringify(json) });
}

/**
 * The error message from a failed API response (`{ error }`), or `fallback`
 * when the body isn't JSON or has no message.
 */
export async function readApiError(res: Response, fallback = 'Something went wrong'): Promise<string> {
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    if (typeof body?.error === 'string' && body.error.trim()) return body.error;
  } catch {
    // not JSON
  }
  return fallback;
}
