/**
 * Moodle error mapping.
 *
 * Converts upstream Moodle exceptions and HTTP failures into `AppError` with a
 * user-facing cause and a concrete remediation. The raw exception, the upstream
 * function name and the request id are preserved in `context` for logs only.
 */

import { AppError, type ErrorCode, type Remediation } from '../core/errors.js';
import { MOODLE_FUNCTIONS } from './functions.js';

export interface UpstreamError {
  /** HTTP status from the Moodle web service endpoint. */
  readonly status?: number;
  /** Moodle `errorcode`, e.g. `accessexception`. */
  readonly errorcode?: string;
  /** Moodle `message` field. May contain HTML; never rendered unescaped. */
  readonly message?: string;
  readonly debugMessage?: string;
  /** Exception class name reported by Moodle. */
  readonly exception?: string;
  readonly fn?: string;
  readonly cause?: unknown;
}

interface MappingRule {
  readonly match: (error: UpstreamError) => boolean;
  readonly code: ErrorCode;
  readonly message: string;
  readonly cause: (error: UpstreamError) => string;
  readonly remediation?: Remediation;
}

const MOODLE_REMEDIATION: Record<string, Remediation> = {
  capabilities: { action: 'Ver permisos de la instancia', href: '/moodles' },
  alreadyEnrolled: { action: 'Ver matrícula actual', href: '/enrolments' },
  missingPlugin: { action: 'Instalar plugin complementario', href: '/moodles' },
  userNotFound: { action: 'Buscar usuario en la instancia', href: '/users' },
  courseNotFound: { action: 'Buscar curso en la instancia', href: '/courses' },
};

const RULES: readonly MappingRule[] = [
  {
    match: (e) => e.errorcode === 'accessexception' || e.errorcode === 'requireloginonpage' || e.status === 403,
    code: 'MOODLE_ACCESS_DENIED',
    message: 'Moodle rechazó la operación por permisos.',
    cause: () =>
      'La cuenta del token no tiene las capacidades requeridas en la instancia, o el servicio web no está habilitado para esa función.',
    remediation: MOODLE_REMEDIATION.capabilities,
  },
  {
    match: (e) =>
      e.errorcode === 'invalid_parameter_exception' ||
      e.errorcode === 'invalid_parameter' ||
      e.status === 422,
    code: 'MOODLE_INVALID_PARAMETER',
    message: 'Moodle rechazó uno de los datos enviados.',
    cause: () => 'Algún campo del payload no cumple el esquema que Moodle espera para esa función.',
  },
  {
    match: (e) => e.errorcode === 'requirelogin' || e.errorcode === 'authentication_failure',
    code: 'MOODLE_AUTH_FAILED',
    message: 'No se pudo autenticar contra Moodle.',
    cause: () =>
      'El token es inválido, expiró, o el usuario del servicio web fue eliminado o suspendido.',
  },
  {
    match: (e) => e.errorcode === 'errorwebservice' || e.errorcode === 'webservice_access_exception',
    code: 'MOODLE_ACCESS_DENIED',
    message: 'Moodle no habilitó la función web solicitada.',
    cause: () =>
      'La función no está habilitada en el servicio web del token, o no existe en esta versión de Moodle.',
  },
  {
    match: (e) => e.errorcode === 'usernotexists' || e.errorcode === 'nouser',
    code: 'MOODLE_NOT_FOUND',
    message: 'El usuario no existe en la instancia de Moodle.',
    cause: () => 'Moodle no encontró el usuario por identificador, correo o username.',
    remediation: MOODLE_REMEDIATION.userNotFound,
  },
  {
    match: (e) => e.errorcode === 'coursenotexists' || e.errorcode === 'invalidcourseid',
    code: 'MOODLE_NOT_FOUND',
    message: 'El curso no existe en la instancia de Moodle.',
    cause: () => 'Moodle no encontró el curso por identificador o shortname.',
    remediation: MOODLE_REMEDIATION.courseNotFound,
  },
  {
    match: (e) => e.errorcode === 'enrolment_duplicate' || e.errorcode === 'useralreadyenrolled',
    code: 'MOODLE_CONFLICT',
    message: 'La matrícula ya existe.',
    cause: () => 'El usuario ya está matriculado en el curso con ese rol y método.',
    remediation: MOODLE_REMEDIATION.alreadyEnrolled,
  },
  {
    match: (e) => e.errorcode === 'shortnameexists' || e.errorcode === 'shortnametaken',
    code: 'MOODLE_CONFLICT',
    message: 'El identificador del curso ya está en uso.',
    cause: () => 'Ya existe un curso con ese shortname en la categoría destino.',
  },
  {
    match: (e) => e.errorcode === 'categoryexists' || e.errorcode === 'categorynameexists',
    code: 'MOODLE_CONFLICT',
    message: 'Ya existe una categoría con ese nombre.',
    cause: () => 'Moodle no permite dos categorías con el mismo nombre dentro del mismo padre.',
  },
  {
    match: (e) => e.errorcode === 'moodle_exception' && (e.message ?? '').includes('nocapability'),
    code: 'MOODLE_ACCESS_DENIED',
    message: 'Moodle rechazó la operación por permisos.',
    cause: () => 'La cuenta del token no tiene la capacidad requerida.',
    remediation: MOODLE_REMEDIATION.capabilities,
  },
  {
    match: (e) => e.status === 404,
    code: 'MOODLE_UNREACHABLE',
    message: 'No se pudo contactar con la instancia de Moodle.',
    cause: () => 'El endpoint de servicios web respondió 404. Verificá la URL y que /webservice/rest/server.php exista.',
  },
  {
    match: (e) => e.status === 429,
    code: 'MOODLE_RATE_LIMITED',
    message: 'La instancia de Moodle está limitando las peticiones.',
    cause: () => 'Se alcanzó el límite de peticiones de la instancia o de su servidor. Reintentá más tarde.',
  },
  {
    match: (e) => e.status === 504 || e.errorcode === 'timeoutexception',
    code: 'MOODLE_TIMEOUT',
    message: 'Moodle tardó demasiado en responder.',
    cause: () => 'La operación superó el tiempo de espera configurado. Puede ser carga alta en el LMS.',
  },
  {
    match: (e) => e.status === 502 || e.status === 503 || e.status === 500,
    code: 'MOODLE_UNREACHABLE',
    message: 'No se pudo completar la operación en Moodle.',
    cause: () => 'La instancia de Moodle devolvió un error interno o está temporalmente indisponible.',
  },
];

/**
 * Maps an upstream failure to an `AppError`. Unrecognised errors become a
 * generic `MOODLE_UNREACHABLE` with the original preserved in context, so we
 * never leak a raw Moodle message to the user.
 */
export function mapMoodleError(error: UpstreamError): AppError {
  for (const rule of RULES) {
    if (rule.match(error)) {
      return new AppError({
        code: rule.code,
        message: rule.message,
        cause: rule.cause(error),
        ...(rule.remediation ? { remediation: rule.remediation } : {}),
        context: buildContext(error),
      });
    }
  }

  return new AppError({
    code: 'MOODLE_UNREACHABLE',
    message: 'No se pudo completar la operación en Moodle.',
    cause: 'Moodle devolvió una respuesta inesperada.',
    context: buildContext(error),
  });
}

function buildContext(error: UpstreamError): Record<string, unknown> {
  return {
    upstreamStatus: error.status,
    upstreamErrorcode: error.errorcode,
    upstreamException: error.exception,
    upstreamMessage: error.message,
    upstreamDebug: error.debugMessage,
    fn: error.fn,
    cause: error.cause instanceof Error ? error.cause.message : error.cause,
  };
}

/**
 * Errors that are normal outcomes rather than faults. A plan treats these as
 * `skipped` instead of `failed`, which keeps idempotent re-runs clean.
 */
export const EXPECTED_MOODLE_ERRORS: ReadonlySet<string> = new Set([
  'enrolment_duplicate',
  'useralreadyenrolled',
  'shortnameexists',
  'shortnametaken',
  'categoryexists',
  'categorynameexists',
  'usernotexists',
  'coursenotexists',
]);

export function isExpectedMoodleError(error: UpstreamError): boolean {
  if (error.errorcode && EXPECTED_MOODLE_ERRORS.has(error.errorcode)) return true;
  return false;
}

/** Human-readable label for a web service function, used in logs and jobs. */
export function describeFunction(fn: string): string {
  const entry = Object.values(MOODLE_FUNCTIONS).find((spec) => spec.fn === fn);
  return entry ? entry.fn : fn;
}