/**
 * Deterministic fixture data for the mock adapter.
 *
 * Seeded so tests and local development produce identical results across runs.
 * The mock is intentionally *smaller* than production fixtures: it exists to
 * unblock backend work, not to pretend we have real tenants.
 */

import type { MoodleSiteInfo } from './functions.js';

export const MOCK_LATENCY_RANGE_MS = { min: 8, max: 180 } as const;

/**
 * Function list approximating a Moodle 4.5 core install. A subset of our
 * registry plus unrelated core functions, so the discovery diff has something
 * to report. Two entries are deliberately absent (`coursesDelete`,
 * `groupsCreate`) to exercise the "function not available" path.
 */
export const MOCK_AVAILABLE_FUNCTIONS: readonly string[] = [
  'core_auth_confirm_user',
  'core_auth_is_minor',
  'core_auth_request_password_reset',
  'core_cohort_add_members',
  'core_cohort_create_cohort',
  'core_cohort_get_cohorts',
  'core_cohort_remove_members',
  'core_completion_get_course_completion_status',
  'core_course_get_categories',
  'core_course_get_contents',
  'core_course_get_courses',
  'core_course_get_courses_by_field',
  'core_course_get_enrolled_users_by_course_id',
  'core_course_create_courses',
  'core_course_update_course',
  'core_course_update_module',
  'core_enrol_get_course_enrolment_methods',
  'core_grades_get_grades',
  'core_group_add_members',
  'core_group_get_groups',
  'core_issue_get_issue',
  'core_message_get_messages',
  'core_user_get_users',
  'core_user_get_users_by_field',
  'core_user_create_users',
  'core_user_update_users',
  'core_webservice_get_site_info',
  'enrol_manual_enrol_user',
  'unenrol_user',
  // Plugin-provided, present because the mock declares the plugin installed.
  'local_moodlecontrolcenter_get_my_capabilities',
  'local_moodlecontrolcenter_clone_course',
  'local_moodlecontrolcenter_health_check',
  // Deliberately NOT present: exercises the missing-function path.
  // 'core_course_delete_courses'
  // 'core_group_create_group'
];

export const MOCK_CAPABILITIES_GRANTED: readonly string[] = [
  'moodle/user:view',
  'moodle/user:create',
  'moodle/user:edit',
  'moodle/course:view',
  'moodle/course:create',
  'moodle/course:manage',
  'moodle/webservice:create',
  'moodle/enrol:manage',
  'moodle/cohort:view',
  'moodle/cohort:manage',
  'moodle/site:accessallgroups',
  'moodle/grade:read',
  'local_moodlecontrolcenter/clone_course',
  'local_moodlecontrolcenter/get_my_capabilities',
  'local_moodlecontrolcenter/health_check',
];

/** Granted in reality but not listed by the mock probe, to test `unknown`. */
export const MOCK_CAPABILITIES_DENIED: readonly string[] = [
  'moodle/course:delete',
  'moodle/site:config',
  'local_moodlecontrolcenter/set_grades',
];

export function createMockSiteInfo(sitename = 'Moodle Mock'): MoodleSiteInfo {
  return {
    sitename,
    release: '4.5 (Build: 2025040700)',
    version: '2025040700.00',
    versionnumber: 2025040700,
    major: 4,
    minimal: 5,
    functions: [...MOCK_AVAILABLE_FUNCTIONS],
    usersCanBeListed: true,
    usercanmanageownfiles: true,
    userIsAdmin: false,
    lang: 'es',
  };
}

export function createMockFunctionList(): readonly string[] {
  return [...MOCK_AVAILABLE_FUNCTIONS];
}

export function createMockCapabilitySet(): {
  granted: readonly string[];
  denied: readonly string[];
} {
  return {
    granted: [...MOCK_CAPABILITIES_GRANTED],
    denied: [...MOCK_CAPABILITIES_DENIED],
  };
}