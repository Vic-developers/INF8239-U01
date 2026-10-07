/**
 * HTTP client.
 *
 * Two decisions shape everything here:
 *
 * 1. `credentials: 'include'` on every request. The access token is an
 *    httpOnly cookie; without this the browser will not attach it and the
 *    app would appear to be permanently signed out.
 *
 * 2. The API's error envelope is unwrapped into a typed `ApiError`. The
 *    server sends `{ error: { code, message, remediation, details } }`, and
 *    every screen needs the same access to `code` (to branch) and
 *    `details` (to mark the offending field). Parsing it once here is what
 *    keeps that consistent instead of each caller re-reading a response.
 *
 * Refresh runs single-flight: a burst of parallel 401s triggers one
 * `POST /auth/refresh`, not one per request, because each refresh rotates
 * the refresh token and a parallel burst would trip the reuse detector and
 * revoke the whole session chain.
 */

import type { ApiErrorBody, ErrorCode, FieldIssue, Remediation } from '@mcc/shared';

/** Prefix stripped by the dev proxy so the browser stays on one origin. */
const BASE = '/api';

export class ApiError extends Error {
  readonly code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';
  readonly status: number;
  readonly remediation?: Remediation;
  readonly details?: readonly FieldIssue[];
  readonly requestId?: string;

  constructor(init: {
    code: ErrorCode | 'NETWORK_ERROR' | 'UNKNOWN';
    status: number;
    message: string;
    remediation?: Remediation;
    details?: readonly FieldIssue[];
    requestId?: string;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.code = init.code;
    this.status = init.status;
    if (init.remediation !== undefined) this.remediation = init.remediation;
    if (init.details !== undefined) this.details = init.details;
    if (init.requestId !== undefined) this.requestId = init.requestId;
  }

  /** The issue attached to a specific form field, if the server named one. */
  issueFor(field: string): string | undefined {
    return this.details?.find((detail) => detail.field === field)?.issue;
  }

  static is(value: unknown): value is ApiError {
    return value instanceof ApiError;
  }
}

interface RequestInit_ extends RequestInit {
  /** Skips the refresh-and-retry path; used by auth itself. */
  readonly noRetry?: boolean;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Refreshes the session once, no matter how many requests ask at once.
 *
 * Returns false when there was nothing to refresh or it failed, so the
 * caller knows to surface the original 401 rather than loop.
 */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { accept: 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    } finally {
      // Cleared on the next tick so concurrent callers awaiting this
      // promise all observe the same result before it is replaced.
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: ApiErrorBody | undefined;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    // A proxy or crash page: no envelope. Fall through to the status.
  }

  const error = body?.error;
  if (error !== undefined && typeof error.code === 'string') {
    return new ApiError({
      code: error.code,
      status: response.status,
      message: error.message,
      ...(error.remediation !== undefined ? { remediation: error.remediation } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
      requestId: error.requestId,
    });
  }

  return new ApiError({
    code: 'UNKNOWN',
    status: response.status,
    message: `El servidor respondió ${response.status}.`,
    ...(response.headers.get('x-request-id')
      ? { requestId: response.headers.get('x-request-id') ?? undefined }
      : {}),
  });
}

async function request<T>(path: string, init: RequestInit_ = {}): Promise<T> {
  const { noRetry = false, headers, ...rest } = init;

  const doFetch = (): Promise<Response> =>
    fetch(`${BASE}${path}`, {
      credentials: 'include',
      ...rest,
      headers: {
        accept: 'application/json',
        ...(rest.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(headers ?? {}),
      },
    });

  let response: Response;
  try {
    response = await doFetch();
  } catch (networkError) {
    // Reachability and authentication are different problems, and telling
    // them apart is what stops the UI from logging the user out because
    // the API is restarting.
    throw new ApiError({
      code: 'NETWORK_ERROR',
      status: 0,
      message: 'No se pudo conectar con el servidor.',
      ...(networkError instanceof Error ? {} : {}),
    });
  }

  // One refresh attempt for a 401. Auth routes opt out — a failed login
  // must answer 401, never be retried into a success — with one exception:
  // `GET /auth/session` is a read, and it is exactly the request that runs
  // on a page load. Excluding it meant an access token past its 15-minute
  // TTL dropped the user to the login screen while a perfectly good
  // 30-day refresh cookie sat there unused, which is the one thing a
  // refresh token exists to prevent.
  const refreshable = !path.startsWith('/auth/') || path === '/auth/session';
  if (response.status === 401 && !noRetry && refreshable) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await doFetch();
    }
  }

  if (!response.ok) {
    throw await toApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (text.length === 0) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),

  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),

  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'PATCH',
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),

  delete: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),

  /** Auth routes never refresh-and-retry; a bad password stays a 401. */
  postAuth: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, {
      method: 'POST',
      noRetry: true,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }),
};
