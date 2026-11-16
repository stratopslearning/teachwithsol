/**
 * Standardized API error responses.
 *
 * Goals:
 *   - Every API route returns the same JSON shape for errors so the client
 *     and Sentry both see consistent fields.
 *   - Internal error details NEVER leak to the client in production. We
 *     attach them to the server log (Sentry) instead.
 */
import { unstable_rethrow } from 'next/navigation';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export interface ApiErrorBody {
  error: string;
  code?: string;
  details?: unknown;
  // Optional flags consumed by the existing client code (kept for backward
  // compatibility with messages like { quizEnded: true }).
  [extra: string]: unknown;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  extras?: Record<string, unknown>;

  constructor(opts: {
    status: number;
    message: string;
    code?: string;
    details?: unknown;
    extras?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.status = opts.status;
    this.code = opts.code;
    this.details = opts.details;
    this.extras = opts.extras;
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError({ status: 400, message, code: 'bad_request', details });
  }
  static unauthorized(message = 'Unauthorized') {
    return new ApiError({ status: 401, message, code: 'unauthorized' });
  }
  static forbidden(message = 'Forbidden') {
    return new ApiError({ status: 403, message, code: 'forbidden' });
  }
  static paymentRequired(message = 'Payment required') {
    return new ApiError({ status: 402, message, code: 'payment_required' });
  }
  static notFound(message = 'Not found') {
    return new ApiError({ status: 404, message, code: 'not_found' });
  }
  static conflict(message = 'Conflict') {
    return new ApiError({ status: 409, message, code: 'conflict' });
  }
  static tooMany(message = 'Too many requests', extras?: Record<string, unknown>) {
    return new ApiError({
      status: 429,
      message,
      code: 'rate_limited',
      extras,
    });
  }
  static payloadTooLarge(message = 'Payload too large') {
    return new ApiError({
      status: 413,
      message,
      code: 'payload_too_large',
    });
  }
  static internal(message = 'Internal server error') {
    return new ApiError({ status: 500, message, code: 'internal' });
  }
}

export function jsonError(err: ApiError): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: err.message,
    ...(err.code ? { code: err.code } : {}),
    ...(err.details ? { details: err.details } : {}),
    ...(err.extras ?? {}),
  };
  return NextResponse.json(body, { status: err.status });
}

/**
 * Convert any thrown value into a normalized API response. Use as:
 *
 *   try { ... } catch (err) { return apiErrorResponse(err); }
 */
export function apiErrorResponse(err: unknown): NextResponse<ApiErrorBody> {
  // Next's redirect()/notFound() signal by throwing; let the framework handle
  // them instead of logging a 500.
  unstable_rethrow(err);
  if (err instanceof ApiError) {
    return jsonError(err);
  }
  if (err instanceof ZodError) {
    return jsonError(ApiError.badRequest('Validation error', err.errors));
  }
  console.error('Unhandled API error:', err);
  // Never leak the underlying error message in production.
  return jsonError(ApiError.internal());
}
