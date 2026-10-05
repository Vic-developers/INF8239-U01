import { describe, expect, it } from 'vitest';
import { AppError, asAppError } from '../core/errors.js';
import {
  isExpectedMoodleError,
  mapMoodleError,
} from '../moodle/errors.js';

describe('mapMoodleError', () => {
  it('translates an access exception into an actionable permission error', () => {
    const error = mapMoodleError({
      status: 403,
      errorcode: 'accessexception',
      fn: 'core_course_create_courses',
    });

    expect(error.code).toBe('MOODLE_ACCESS_DENIED');
    expect(error.httpStatus).toBe(502);
    expect(error.remediation?.href).toBe('/moodles');
    expect(error.message).not.toContain('accessexception');
  });

  it('never leaks the upstream debug payload into the user-facing message', () => {
    const error = mapMoodleError({
      status: 500,
      errorcode: 'error',
      debugMessage: 'SQLSTATE[42P01]: relation "mdl_x" does not exist at /var/www/moodle/lib/dml/moodle_database.php:1234',
      message: 'Internal error',
    });

    expect(error.message).not.toContain('SQLSTATE');
    expect(error.cause).not.toContain('SQLSTATE');
    expect(JSON.stringify(error.context)).toContain('SQLSTATE');
  });

  it('maps duplicate enrolment to a conflict the plan engine can skip', () => {
    const error = mapMoodleError({ errorcode: 'enrolment_duplicate' });
    expect(error.code).toBe('MOODLE_CONFLICT');
    expect(isExpectedMoodleError({ errorcode: 'enrolment_duplicate' })).toBe(true);
    expect(isExpectedMoodleError({ errorcode: 'accessexception' })).toBe(false);
  });

  it('maps timeouts to 504 so clients retry rather than surface a bug', () => {
    expect(mapMoodleError({ status: 504 }).code).toBe('MOODLE_TIMEOUT');
    expect(mapMoodleError({ status: 504 }).httpStatus).toBe(504);
  });

  it('falls back to a generic error for unknown upstream failures', () => {
    const error = mapMoodleError({ status: 418, errorcode: 'teapot' });
    expect(error.code).toBe('MOODLE_UNREACHABLE');
    expect(error.httpStatus).toBe(502);
  });
});

describe('AppError', () => {
  it('serializes to the documented envelope', () => {
    const body = new AppError({
      code: 'VALIDATION_FAILED',
      message: 'Datos inválidos.',
      details: [{ field: 'email', issue: 'formato incorrecto' }],
    }).toBody('req-1');

    expect(body.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      message: 'Datos inválidos.',
      requestId: 'req-1',
    });
    expect(body.error.details?.[0]?.field).toBe('email');
    expect(typeof body.error.timestamp).toBe('string');
  });

  it('normalises unknown throws into a safe internal error', () => {
    const wrapped = asAppError(new TypeError('boom'));
    expect(wrapped.code).toBe('INTERNAL_ERROR');
    expect(wrapped.message).toBe('Ocurrió un error inesperado.');
    expect(wrapped.message).not.toContain('boom');
    expect(wrapped.context).toMatchObject({ original: 'boom' });
  });
});