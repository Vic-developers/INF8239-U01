/**
 * Moodle Web Service function catalogue and capability requirements.
 *
 * IMPORTANT: availability varies by Moodle version (4.2 / 4.4 / 4.5 / 5.x) and
 * by the capabilities granted to the service token. Nothing here is assumed at
 * runtime — the discovery probe records what the target instance actually
 * exposes and the registry is used to *check*, never to assert.
 *
 * Phase 0 includes a probe against a real Moodle to verify this table. Any
 * entry that turns out to be wrong is corrected here, not worked around at the
 * call site.
 */

export interface MoodleFunctionSpec {
  /** Fully-qualified Moodle web service function name. */
  readonly fn: string;
  /** Moodle capabilities the token account needs for this call. */
  readonly requiredCapabilities: readonly string[];
  /** Writes to Moodle. Used to gate background plans vs interactive reads. */
  readonly mutating: boolean;
  /** Rough relative cost, used to weight the rate limiter. */
  readonly cost: number;
}

/**
 * Functions we depend on. Green = standard core web service.
 */
export const MOODLE_FUNCTIONS = {
  siteInfo: {
    fn: 'core_webservice_get_site_info',
    requiredCapabilities: [],
    mutating: false,
    cost: 1,
  },
  categoriesGet: {
    fn: 'core_course_get_categories',
    requiredCapabilities: ['moodle/course:view'],
    mutating: false,
    cost: 1,
  },
  coursesGet: {
    fn: 'core_course_get_courses',
    requiredCapabilities: ['moodle/course:view'],
    mutating: false,
    cost: 2,
  },
  coursesByField: {
    fn: 'core_course_get_courses_by_field',
    requiredCapabilities: ['moodle/course:view'],
    mutating: false,
    cost: 1,
  },
  coursesCreate: {
    fn: 'core_course_create_courses',
    requiredCapabilities: ['moodle/webservice:create', 'moodle/course:create'],
    mutating: true,
    cost: 3,
  },
  coursesUpdate: {
    fn: 'core_course_update_course',
    requiredCapabilities: ['moodle/course:manage'],
    mutating: true,
    cost: 2,
  },
  coursesDelete: {
    fn: 'core_course_delete_courses',
    requiredCapabilities: ['moodle/course:manage'],
    mutating: true,
    cost: 2,
  },
  contentsGet: {
    fn: 'core_course_get_contents',
    requiredCapabilities: ['moodle/course:view'],
    mutating: false,
    cost: 2,
  },
  moduleUpdate: {
    fn: 'core_course_update_module',
    requiredCapabilities: ['moodle/course:manage'],
    mutating: true,
    cost: 2,
  },
  enrolledUsersGet: {
    fn: 'core_course_get_enrolled_users_by_course_id',
    requiredCapabilities: ['moodle/course:view', 'moodle/user:viewdetails'],
    mutating: false,
    cost: 3,
  },
  enrolMethodsGet: {
    fn: 'core_enrol_get_course_enrolment_methods',
    requiredCapabilities: ['moodle/course:view'],
    mutating: false,
    cost: 1,
  },
  manualEnrolUser: {
    fn: 'enrol_manual_enrol_user',
    requiredCapabilities: ['moodle/enrol:manage'],
    mutating: true,
    cost: 2,
  },
  unenrolUser: {
    fn: 'unenrol_user',
    requiredCapabilities: ['moodle/enrol:manage'],
    mutating: true,
    cost: 2,
  },
  usersGet: {
    fn: 'core_user_get_users',
    requiredCapabilities: ['moodle/user:view'],
    mutating: false,
    cost: 2,
  },
  usersByField: {
    fn: 'core_user_get_users_by_field',
    requiredCapabilities: ['moodle/user:view'],
    mutating: false,
    cost: 1,
  },
  usersCreate: {
    fn: 'core_user_create_users',
    requiredCapabilities: ['moodle/user:create'],
    mutating: true,
    cost: 2,
  },
  usersUpdate: {
    fn: 'core_user_update_users',
    requiredCapabilities: ['moodle/user:edit'],
    mutating: true,
    cost: 2,
  },
  cohortsGet: {
    fn: 'core_cohort_get_cohorts',
    requiredCapabilities: ['moodle/cohort:view'],
    mutating: false,
    cost: 1,
  },
  cohortsCreate: {
    fn: 'core_cohort_create_cohort',
    requiredCapabilities: ['moodle/cohort:manage'],
    mutating: true,
    cost: 2,
  },
  cohortMembersAdd: {
    fn: 'core_cohort_add_members',
    requiredCapabilities: ['moodle/cohort:manage'],
    mutating: true,
    cost: 2,
  },
  cohortMembersRemove: {
    fn: 'core_cohort_remove_members',
    requiredCapabilities: ['moodle/cohort:manage'],
    mutating: true,
    cost: 2,
  },
  groupsGet: {
    fn: 'core_group_get_groups',
    requiredCapabilities: ['moodle/site:accessallgroups'],
    mutating: false,
    cost: 1,
  },
  groupsCreate: {
    fn: 'core_group_create_group',
    requiredCapabilities: ['moodle/course:manage'],
    mutating: true,
    cost: 2,
  },
  groupMembersAdd: {
    fn: 'core_group_add_members',
    requiredCapabilities: ['moodle/course:manage'],
    mutating: true,
    cost: 2,
  },
  completionGet: {
    fn: 'core_course_get_completion_status',
    requiredCapabilities: ['moodle/course:view'],
    mutating: false,
    cost: 2,
  },
  gradesGet: {
    fn: 'core_grades_get_grades',
    requiredCapabilities: ['moodle/grade:read'],
    mutating: false,
    cost: 3,
  },
} as const satisfies Record<string, MoodleFunctionSpec>;

export type MoodleFunctionKey = keyof typeof MOODLE_FUNCTIONS;

/**
 * Capabilities exposed by `local_moodlecontrolcenter`. Standard Moodle does not
 * offer web services for these operations, so the plugin is the only path.
 */
export const PLUGIN_CAPABILITIES = {
  createModule: 'local_moodlecontrolcenter/create_module',
  cloneCourse: 'local_moodlecontrolcenter/clone_course',
  setGrades: 'local_moodlecontrolcenter/set_grades',
  setUserSuspended: 'local_moodlecontrolcenter/set_user_suspended',
  resetPassword: 'local_moodlecontrolcenter/reset_password',
  broadcastMessage: 'local_moodlecontrolcenter/broadcast_message',
  uploadFile: 'local_moodlecontrolcenter/upload_file',
  getLogs: 'local_moodlecontrolcenter/get_logs',
  getPageHtml: 'local_moodlecontrolcenter/get_page_html',
  getMyCapabilities: 'local_moodlecontrolcenter/get_my_capabilities',
  healthCheck: 'local_moodlecontrolcenter/health_check',
} as const;

export const PLUGIN_FUNCTIONS = {
  createModule: 'local_moodlecontrolcenter_create_module',
  updateModule: 'local_moodlecontrolcenter_update_module',
  deleteModule: 'local_moodlecontrolcenter_delete_module',
  cloneCourse: 'local_moodlecontrolcenter_clone_course',
  setGrades: 'local_moodlecontrolcenter_set_grades',
  setUserSuspended: 'local_moodlecontrolcenter_set_user_suspended',
  resetPassword: 'local_moodlecontrolcenter_reset_password',
  broadcastMessage: 'local_moodlecontrolcenter_broadcast_message',
  uploadFile: 'local_moodlecontrolcenter_upload_file',
  getLogs: 'local_moodlecontrolcenter_get_logs',
  getPageHtml: 'local_moodlecontrolcenter_get_page_html',
  getMyCapabilities: 'local_moodlecontrolcenter_get_my_capabilities',
  healthCheck: 'local_moodlecontrolcenter_health_check',
} as const satisfies Record<string, string>;

/**
 * Capabilities required per plan kind. Checked before a job starts so a
 * misconfigured token fails in seconds with an actionable message instead of
 * after 400 failed HTTP calls.
 */
export const PLAN_REQUIRED_CAPABILITIES: Record<string, readonly string[]> = {
  'user.import': ['moodle/user:create'],
  'user.create': ['moodle/user:create'],
  'user.suspend': [PLUGIN_CAPABILITIES.setUserSuspended],
  'course.create': ['moodle/webservice:create', 'moodle/course:create'],
  'course.update': ['moodle/course:manage'],
  'course.clone': [PLUGIN_CAPABILITIES.cloneCourse],
  'category.create': ['moodle/course:manage'],
  'enrolment.create': ['moodle/enrol:manage'],
  'enrolment.unenrol': ['moodle/enrol:manage'],
  'cohort.members.add': ['moodle/cohort:manage'],
  'group.members.add': ['moodle/course:manage'],
  'period.provision': ['moodle/course:create', 'moodle/enrol:manage'],
  'moodle.instance.probe': [],
};

/** Adapter behaviour keyed by the discovered major version. */
export const SUPPORTED_MOODLE_MAJOR_VERSIONS = [4, 5] as const;

export const MINIMUM_MOODLE_VERSION = '4.2';

export interface MoodleSiteInfo {
  readonly sitename: string;
  readonly release: string;
  readonly version: string;
  readonly versionnumber: number;
  readonly major: number;
  readonly minimal: number;
  readonly mobilecssurl?: string;
  readonly functions?: readonly string[];
  readonly usersCanBeListed: boolean;
  readonly usercanmanageownfiles: boolean;
  readonly userIsAdmin: boolean;
  readonly lang: string;
}

export interface HealthCheckResult {
  readonly status: 'ok' | 'degraded' | 'down';
  readonly checks: readonly HealthProbe[];
  readonly latencyP50Ms: number;
  readonly checkedAt: string;
}

export interface HealthProbe {
  readonly name: 'reachability' | 'authentication' | 'api' | 'functions' | 'capabilities' | 'latency';
  readonly status: 'pass' | 'warn' | 'fail' | 'skipped';
  readonly detail: string;
  readonly durationMs?: number;
}