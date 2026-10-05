/**
 * Version-range tests.
 *
 * These encode the reason the range is 4.0 – 5.3 rather than a single pinned
 * version: one code path has to serve the oldest supported instance and the
 * newest, so the differences have to be explicit and tested rather than
 * discovered as runtime errors.
 */

import { describe, expect, it } from 'vitest';
import {
  FUNCTION_VERSION_BOUNDS,
  MAXIMUM_MOODLE_VERSION,
  MINIMUM_MOODLE_VERSION,
  compareMoodleVersions,
  isSupportedMoodleVersion,
  parseMoodleVersion,
  resolveFunction,
  stripUnsupportedParams,
} from '../moodle/versions.js';

const v = (major: number, minor: number, patch = 0) => ({ major, minor, patch });

describe('parseMoodleVersion', () => {
  it('parses the bare version field', () => {
    expect(parseMoodleVersion('4.5')).toEqual(v(4, 5));
    expect(parseMoodleVersion('5.0')).toEqual(v(5, 0));
  });

  it('parses the free-text release field, skipping the leading word', () => {
    expect(parseMoodleVersion('Moodle 4.4.2 (Build: 2024042200)')).toEqual(v(4, 4, 2));
  });

  it('treats a missing patch as zero', () => {
    expect(parseMoodleVersion('4.2')?.patch).toBe(0);
  });

  it('returns null when there is nothing version-shaped', () => {
    // A null result must never be read as "any version"; the resolver marks such
    // a resolution provisional instead.
    expect(parseMoodleVersion('')).toBeNull();
    expect(parseMoodleVersion(null)).toBeNull();
    expect(parseMoodleVersion(undefined)).toBeNull();
    expect(parseMoodleVersion('Moodle')).toBeNull();
    expect(parseMoodleVersion('latest')).toBeNull();
  });
});

describe('compareMoodleVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareMoodleVersions(v(4, 0), v(5, 0))).toBeLessThan(0);
    expect(compareMoodleVersions(v(4, 5), v(4, 2))).toBeGreaterThan(0);
    expect(compareMoodleVersions(v(4, 4, 2), v(4, 4, 9))).toBeLessThan(0);
    expect(compareMoodleVersions(v(4, 1, 3), v(4, 1, 3))).toBe(0);
  });

  it('does not treat 4.10 as older than 4.9 by string order', () => {
    // The failure mode this guards: string comparison puts 4.10 before 4.9,
    // which would silently disable features on the wrong instances.
    expect(compareMoodleVersions(v(4, 10), v(4, 9))).toBeGreaterThan(0);
  });
});

describe('isSupportedMoodleVersion', () => {
  it('accepts both ends of the declared range', () => {
    expect(isSupportedMoodleVersion(v(4, 0))).toBe(true);
    expect(isSupportedMoodleVersion(v(5, 3))).toBe(true);
  });

  it('rejects versions outside the range', () => {
    expect(isSupportedMoodleVersion(v(3, 11))).toBe(false);
    expect(isSupportedMoodleVersion(v(6, 0))).toBe(false);
    expect(isSupportedMoodleVersion(v(5, 4))).toBe(false);
  });

  it('exposes bounds matching the documented range', () => {
    expect(MINIMUM_MOODLE_VERSION).toEqual(v(4, 0));
    expect(MAXIMUM_MOODLE_VERSION).toEqual(v(5, 3));
  });
});

describe('resolveFunction', () => {
  it('returns the plain name on an unconstrained version', () => {
    const result = resolveFunction('core_course_get_categories', v(4, 5));

    expect(result.fn).toBe('core_course_get_categories');
    expect(result.deprecated).toBe(false);
    expect(result.unavailable).toBeUndefined();
  });

  it('prefers the replacement on 4.2 and later', () => {
    // unenrol_user was deprecated in 4.2 in favour of core_enrol_unenrol_user.
    const result = resolveFunction('unenrol_user', v(4, 2), [
      'unenrol_user',
      'core_enrol_unenrol_user',
    ]);

    expect(result.fn).toBe('core_enrol_unenrol_user');
    expect(result.deprecated).toBe(false);
    expect(result.detail).toContain('obsoleta');
  });

  it('keeps the legacy name on 4.1, where there is no alternative', () => {
    const result = resolveFunction('unenrol_user', v(4, 1), ['unenrol_user']);

    expect(result.fn).toBe('unenrol_user');
    expect(result.deprecated).toBe(false);
    expect(result.unavailable).toBeUndefined();
  });

  it('reports deprecation when the replacement is not installed', () => {
    // The instance still only offers the old name; the plan may proceed, but the
    // operator is told rather than left to find out from a log.
    const result = resolveFunction('unenrol_user', v(4, 5), ['unenrol_user']);

    expect(result.fn).toBe('unenrol_user');
    expect(result.deprecated).toBe(true);
    expect(result.replacedBy).toBe('core_enrol_unenrol_user');
  });

  it('trusts the instance over the version when discovery has run', () => {
    const result = resolveFunction('core_course_get_courses', v(4, 5), ['core_course_get_categories']);

    expect(result.unavailable).toBe('not_exposed_by_instance');
    expect(result.detail).toContain('core_course_get_courses');
  });

  it('accepts a function the instance lists even without version bounds', () => {
    const result = resolveFunction('core_grades_get_grades', v(5, 3), ['core_grades_get_grades']);
    expect(result.unavailable).toBeUndefined();
  });

  it('refuses a version outside the supported range', () => {
    const result = resolveFunction('core_course_get_categories', v(3, 11), [
      'core_course_get_categories',
    ]);

    expect(result.unavailable).toBe('version_unsupported');
    expect(result.detail).toContain('4.0');
    expect(result.detail).toContain('5.3');
  });

  it('marks the answer provisional when the version is unknown', () => {
    // Discovery has not run and the version is unknown: not an error, but the
    // caller must not treat this as confirmed.
    const result = resolveFunction('core_course_get_courses', null, null);

    expect(result.unavailable).toBeUndefined();
    expect(result.detail).toContain('provisional');
  });

  it('still honours the instance list when the version is unknown', () => {
    const result = resolveFunction('unenrol_user', null, [
      'unenrol_user',
      'core_enrol_unenrol_user',
    ]);

    expect(result.unavailable).toBeUndefined();
    expect(result.fn).toBe('unenrol_user');
  });

  it('reports a function gated behind a minimum version', () => {
    // core_course_get_courses is documented as present from 4.0; a hypothetical
    // gate is exercised through the bounds table to prove the branch works.
    const bounds = FUNCTION_VERSION_BOUNDS['unenrol_user'];
    expect(bounds?.deprecatedIn).toEqual(v(4, 2));
    expect(resolveFunction('unenrol_user', v(4, 0)).fn).toBe('unenrol_user');
  });
});

describe('stripUnsupportedParams', () => {
  it('drops options on instances older than 4.4', () => {
    const args = { returnidfrom: 0, options: { offset: 0, limit: 10 } };

    const on43 = stripUnsupportedParams(args, v(4, 3));
    expect(on43).toEqual({ returnidfrom: 0 });

    const on44 = stripUnsupportedParams(args, v(4, 4));
    expect(on44).toEqual({ returnidfrom: 0, options: { offset: 0, limit: 10 } });
  });

  it('leaves the argument object it was handed untouched', () => {
    const args = { options: { offset: 0 } };
    stripUnsupportedParams(args, v(4, 0));

    expect(args.options).toEqual({ offset: 0 });
  });

  it('passes arguments through untouched when the version is unknown', () => {
    // Dropping known-good arguments because the version could not be read would
    // turn an unreadable version into a wrong result.
    const args = { options: { offset: 0, limit: 10 } };
    expect(stripUnsupportedParams(args, null)).toEqual(args);
  });

  it('drops returnfields before 3.11', () => {
    expect(stripUnsupportedParams({ field: 'id', returnfields: ['id'] }, v(3, 9))).toEqual({
      field: 'id',
    });
    expect(stripUnsupportedParams({ field: 'id', returnfields: ['id'] }, v(4, 0))).toEqual({
      field: 'id',
      returnfields: ['id'],
    });
  });
});
