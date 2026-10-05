/**
 * Application error catalogue.
 *
 * Every error crossing the API boundary uses this envelope so the UI can show
 * a human cause and a concrete next action instead of a raw exception. The
 * technical detail (stack, Moodle exception class, upstream status) goes to
 * the log with the request id, never to the response body.
 */

export const ERROR_CODES = [
  // Generic
  'VALIDATION_FAILED',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',

  // Auth
  'INVALID_CREDENTIALS',
  'ACCOUNT_DISABLED',
  'ACCOUNT_LOCKED',
  'SESSION_EXPIRED',
  'REFRESH_TOKEN_REUSED',
  'MFA_REQUIRED',
  'PASSWORD_POLICY_VIOLATION',

  // Tenancy
  'TENANT_NOT_FOUND',
  'TENANT_MISMATCH',
  'CROSS_TENANT_ACCESS',

  // Moodle integration
  'MOODLE_UNREACHABLE',
  'MOODLE_AUTH_FAILED',
  'MOODLE_ACCESS_DENIED',
  'MOODLE_INVALID_PARAMETER',
  'MOODLE_NOT_FOUND',
  'MOODLE_CONFLICT',
  'MOODLE_TIMEOUT',
  'MOODLE_RATE_LIMITED',
  'MOODLE_CIRCUIT_OPEN',
  'MOODLE_PLUGIN_MISSING',
  'MOODLE_CAPABILITY_MISSING',
  'MOODLE_VERSION_UNSUPPORTED',

  // Plan engine
  'PLAN_INVALID',
  'PLAN_CONFLICT',
  'PLAN_NOT_APPROVED',
  'PLAN_ALREADY_EXECUTED',
  'PLAN_CANCELLED',
  'ITEM_ALREADY_EXISTS',

  // Jobs
  'JOB_NOT_CANCELLABLE',
  'JOB_NOT_RESUMABLE',
  'JOB_IN_PROGRESS',

  // Storage / crypto
  'SECRET_DECRYPT_FAILED',
  'ENCRYPTION_KEY_MISSING',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface Remediation {
  /** Short imperative label, e.g. "Ver matrícula actual". */
  readonly action: string;
  /** In-app route the action navigates to. */
  readonly href?: string;
}

export interface FieldIssue {
  readonly field: string;
  readonly issue: string;
  readonly code?: string;
}

/** Serialized error envelope returned by the API. */
export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode;
    /** User-facing message. Never contains stack traces or upstream payloads. */
    readonly message: string;
    /** Why it failed, in user terms. */
    readonly cause?: string;
    readonly remediation?: Remediation;
    readonly details?: readonly FieldIssue[];
    readonly requestId: string;
    readonly timestamp: string;
  };
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  /** User-facing explanation. Distinct from `Error.cause`, which is kept raw. */
  readonly appCause?: string;
  readonly remediation?: Remediation;
  readonly details?: readonly FieldIssue[];
  /** Technical context for logs only. */
  readonly context?: Record<string, unknown>;

  constructor(init: {
    code: ErrorCode;
    message: string;
    httpStatus?: number;
    cause?: string;
    remediation?: Remediation;
    details?: readonly FieldIssue[];
    context?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = 'AppError';
    this.code = init.code;
    this.httpStatus = init.httpStatus ?? defaultHttpStatus(init.code);
    if (init.cause !== undefined) this.appCause = init.cause;
    if (init.remediation !== undefined) this.remediation = init.remediation;
    if (init.details !== undefined) this.details = init.details;
    if (init.context !== undefined) this.context = init.context;
    if (init.context !== undefined) {
      // Keeps the technical detail reachable through the standard Error chain
      // so log processors do not need to know about the custom field.
      this.cause = new Error('internal context', { cause: init.context });
    }
  }

  toBody(requestId: string): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.appCause !== undefined ? { cause: this.appCause } : {}),
        ...(this.remediation !== undefined ? { remediation: this.remediation } : {}),
        ...(this.details !== undefined ? { details: this.details } : {}),
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  static is(value: unknown): value is AppError {
    return value instanceof AppError;
  }
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  FORBIDDEN: 403,
  UNAUTHENTICATED: 401,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,

  INVALID_CREDENTIALS: 401,
  ACCOUNT_DISABLED: 403,
  ACCOUNT_LOCKED: 423,
  SESSION_EXPIRED: 401,
  REFRESH_TOKEN_REUSED: 401,
  MFA_REQUIRED: 401,
  PASSWORD_POLICY_VIOLATION: 422,

  TENANT_NOT_FOUND: 404,
  TENANT_MISMATCH: 404,
  CROSS_TENANT_ACCESS: 404,

  MOODLE_UNREACHABLE: 502,
  MOODLE_AUTH_FAILED: 502,
  MOODLE_ACCESS_DENIED: 502,
  MOODLE_INVALID_PARAMETER: 502,
  MOODLE_NOT_FOUND: 502,
  MOODLE_CONFLICT: 502,
  MOODLE_TIMEOUT: 504,
  MOODLE_RATE_LIMITED: 429,
  MOODLE_CIRCUIT_OPEN: 503,
  MOODLE_PLUGIN_MISSING: 501,
  MOODLE_CAPABILITY_MISSING: 501,
  MOODLE_VERSION_UNSUPPORTED: 501,

  PLAN_INVALID: 422,
  PLAN_CONFLICT: 409,
  PLAN_NOT_APPROVED: 409,
  PLAN_ALREADY_EXECUTED: 409,
  PLAN_CANCELLED: 409,
  ITEM_ALREADY_EXISTS: 409,

  JOB_NOT_CANCELLABLE: 409,
  JOB_NOT_RESUMABLE: 409,
  JOB_IN_PROGRESS: 409,

  SECRET_DECRYPT_FAILED: 500,
  ENCRYPTION_KEY_MISSING: 500,
};

function defaultHttpStatus(code: ErrorCode): number {
  return STATUS_BY_CODE[code] ?? 500;
}

/** Type guard that narrows an unknown catch binding to AppError. */
export function asAppError(value: unknown): AppError {
  if (AppError.is(value)) return value;
  return new AppError({
    code: 'INTERNAL_ERROR',
    message: 'Ocurrió un error inesperado.',
    context: { original: value instanceof Error ? value.message : String(value) },
  });
}