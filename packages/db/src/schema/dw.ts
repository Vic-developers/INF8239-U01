import {
  pgSchema,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  date,
} from 'drizzle-orm/pg-core';

/**
 * Analytics store (`dw`).
 *
 * Derived exclusively from Moodle by the Sync Engine. Nothing here is a source
 * of truth: if it disagrees with Moodle, Moodle wins and the sync fixes it.
 * Reads for reports, dashboards and the risk engine come from here so they
 * never hammer the LMS in real time.
 *
 * `tenant_id` is denormalised onto every table on purpose: RLS policies must be
 * evaluable without joining, and the analytics store is read by a separate
 * read-only role.
 */

export const dw = pgSchema('dw');

/** Which Moodle a row belongs to. Also the natural key for cross-tenant joins. */
export const dimMoodleInstance = dw.table(
  'dim_moodle_instance',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    moodleVersion: text('moodle_version'),
    /** Last successful probe; drives the freshness badge in the UI. */
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  },
  (table) => ({
    byTenant: index('dim_moodle_instance_tenant_idx').on(table.tenantId),
  }),
);

/**
 * Slowly-changing dimension type 2. `is_current` marks the live row and
 * `valid_from`/`valid_to` keep history, so a report run last quarter reproduces
 * even after Moodle changed.
 */
export const dimUser = dw.table(
  'dim_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    /** Moodle's own user id. Natural key for idempotent upserts. */
    moodleId: integer('moodle_id').notNull(),
    username: text('username').notNull(),
    email: text('email'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    fullName: text('full_name').notNull(),
    auth: text('auth').notNull().default('manual'),
    suspended: boolean('suspended').notNull().default(false),
    deleted: boolean('deleted').notNull().default(false),
    lastAccess: timestamp('last_access', { withTimezone: true }),
    lang: text('lang'),
    isCurrent: boolean('is_current').notNull().default(true),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    sourceHash: text('source_hash'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    naturalKey: uniqueIndex('dim_user_natural_key_unique')
      .on(table.moodleInstanceId, table.moodleId, table.validFrom),
    currentByInstance: index('dim_user_current_idx').on(
      table.moodleInstanceId,
      table.isCurrent,
      table.lastAccess,
    ),
    byTenant: index('dim_user_tenant_idx').on(table.tenantId, table.isCurrent),
    nameSearch: index('dim_user_name_idx').on(table.moodleInstanceId, table.fullName),
  }),
);

export const dimCategory = dw.table(
  'dim_category',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    moodleId: integer('moodle_id').notNull(),
    name: text('name').notNull(),
    parentId: integer('parent_id'),
    /** Materialised path (`/1/7/23/`) so subtree queries stay a single index scan. */
    path: text('path').notNull(),
    depth: integer('depth').notNull().default(0),
    sortOrder: integer('sort_order').notNull().default(0),
    description: text('description'),
    isCurrent: boolean('is_current').notNull().default(true),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    naturalKey: uniqueIndex('dim_category_natural_key_unique').on(
      table.moodleInstanceId,
      table.moodleId,
    ),
    byPath: index('dim_category_path_idx').on(table.moodleInstanceId, table.path),
  }),
);

export const dimPeriod = dw.table(
  'dim_period',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    /** e.g. `2027-01`. */
    code: text('code').notNull(),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    status: text('status').notNull().default('planned'),
  },
  (table) => ({
    tenantCode: uniqueIndex('dim_period_tenant_code_unique').on(table.tenantId, table.code),
  }),
);

export const dimCourse = dw.table(
  'dim_course',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    moodleId: integer('moodle_id').notNull(),
    shortName: text('short_name').notNull(),
    fullName: text('full_name').notNull(),
    summary: text('summary'),
    categoryMoodleId: integer('category_moodle_id'),
    categoryPath: text('category_path'),
    periodId: uuid('period_id'),
    startDate: timestamp('start_date', { withTimezone: true }),
    endDate: timestamp('end_date', { withTimezone: true }),
    visible: boolean('visible').notNull().default(true),
    /** Derived: no teacher enrolled. Drives the course health dashboard. */
    hasTeacher: boolean('has_teacher').notNull().default(false),
    hasActivities: boolean('has_activities').notNull().default(false),
    hasCompletion: boolean('has_completion').notNull().default(false),
    hasGrading: boolean('has_grading').notNull().default(false),
    deleted: boolean('deleted').notNull().default(false),
    isCurrent: boolean('is_current').notNull().default(true),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    sourceHash: text('source_hash'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    naturalKey: uniqueIndex('dim_course_natural_key_unique').on(
      table.moodleInstanceId,
      table.moodleId,
      table.validFrom,
    ),
    currentByInstance: index('dim_course_current_idx').on(
      table.moodleInstanceId,
      table.isCurrent,
    ),
    byTenant: index('dim_course_tenant_idx').on(table.tenantId, table.isCurrent),
    byPeriod: index('dim_course_period_idx').on(table.periodId, table.isCurrent),
    byShortName: index('dim_course_shortname_idx').on(table.moodleInstanceId, table.shortName),
  }),
);

export const dimActivity = dw.table(
  'dim_activity',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    moodleId: integer('moodle_id').notNull(),
    courseMoodleId: integer('course_moodle_id').notNull(),
    /** Moodle module name: assignment, quiz, forum, page, book, lesson, h5p, scorm, url, file… */
    moduleName: text('module_name').notNull(),
    name: text('name').notNull(),
    position: integer('position').notNull().default(1),
    visible: boolean('visible').notNull().default(true),
    openDate: timestamp('open_date', { withTimezone: true }),
    closeDate: timestamp('close_date', { withTimezone: true }),
    dueDate: timestamp('due_date', { withTimezone: true }),
    completionTracked: boolean('completion_tracked').notNull().default(false),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    naturalKey: uniqueIndex('dim_activity_natural_key_unique').on(
      table.moodleInstanceId,
      table.moodleId,
    ),
    byCourse: index('dim_activity_course_idx').on(table.moodleInstanceId, table.courseMoodleId),
  }),
);

export const dimCohort = dw.table(
  'dim_cohort',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    moodleId: integer('moodle_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    courseMoodleId: integer('course_moodle_id'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    naturalKey: uniqueIndex('dim_cohort_natural_key_unique').on(
      table.moodleInstanceId,
      table.moodleId,
    ),
  }),
);

export const dimGroup = dw.table(
  'dim_group',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    moodleId: integer('moodle_id').notNull(),
    name: text('name').notNull(),
    courseMoodleId: integer('course_moodle_id').notNull(),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    naturalKey: uniqueIndex('dim_group_natural_key_unique').on(
      table.moodleInstanceId,
      table.moodleId,
    ),
    byCourse: index('dim_group_course_idx').on(table.moodleInstanceId, table.courseMoodleId),
  }),
);

/**
 * Single enrolment fact table. One row per (user, course, role, method).
 * `status` mirrors Moodle's enrolment status so "active students" is a filter,
 * not a second table.
 */
export const factEnrolment = dw.table(
  'fact_enrolment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    userDimId: uuid('user_dim_id').notNull(),
    courseDimId: uuid('course_dim_id').notNull(),
    roleMoodleId: integer('role_moodle_id'),
    roleShortName: text('role_short_name'),
    status: integer('status').notNull().default(0),
    timeStart: timestamp('time_start', { withTimezone: true }),
    timeEnd: timestamp('time_end', { withTimezone: true }),
    isCurrent: boolean('is_current').notNull().default(true),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byCourse: index('fact_enrolment_course_idx').on(table.courseDimId, table.isCurrent, table.status),
    byUser: index('fact_enrolment_user_idx').on(table.userDimId, table.isCurrent),
    byTenant: index('fact_enrolment_tenant_idx').on(table.tenantId, table.isCurrent),
  }),
);

export const factGrade = dw.table(
  'fact_grade',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    userDimId: uuid('user_dim_id').notNull(),
    courseDimId: uuid('course_dim_id').notNull(),
    /** Grade item id from core_grades_get_grades. */
    itemMoodleId: integer('item_moodle_id').notNull(),
    itemName: text('item_name'),
    rawValue: numeric('raw_value', { precision: 12, scale: 4 }),
    maxValue: numeric('max_value', { precision: 12, scale: 4 }),
    /** Precomputed percentage; keeps report queries off raw division. */
    percentage: numeric('percentage', { precision: 6, scale: 2 }),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    graderName: text('grader_name'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byCourse: index('fact_grade_course_idx').on(table.courseDimId, table.userDimId),
    byUser: index('fact_grade_user_idx').on(table.userDimId),
  }),
);

export const factCompletion = dw.table(
  'fact_completion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    userDimId: uuid('user_dim_id').notNull(),
    courseDimId: uuid('course_dim_id').notNull(),
    completionTracked: boolean('completion_tracked').notNull().default(false),
    completedCount: integer('completed_count').notNull().default(0),
    totalCount: integer('total_count').notNull().default(0),
    /** 0-1. Null when the course has no tracked activities. */
    percentage: numeric('percentage', { precision: 6, scale: 2 }),
    isCompleted: boolean('is_completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byCourse: index('fact_completion_course_idx').on(table.courseDimId),
    byUser: index('fact_completion_user_idx').on(table.userDimId),
  }),
);

/**
 * Daily access aggregate. Moodle's raw log store is not exposed by standard web
 * services, so activity is derived from `lastaccess` snapshots instead of
 * fabricated per-event rows.
 */
export const factAccessDaily = dw.table(
  'fact_access_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    userDimId: uuid('user_dim_id').notNull(),
    courseDimId: uuid('course_dim_id'),
    day: date('day').notNull(),
    active: boolean('active').notNull().default(false),
    lastAccess: timestamp('last_access', { withTimezone: true }),
  },
  (table) => ({
    uniqueDay: uniqueIndex('fact_access_daily_unique').on(
      table.moodleInstanceId,
      table.userDimId,
      table.day,
    ),
    byDay: index('fact_access_daily_day_idx').on(table.moodleInstanceId, table.day, table.active),
  }),
);

/** Nightly course-level rollup so dashboard widgets do not scan facts. */
export const factCourseSnapshot = dw.table(
  'fact_course_snapshot',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    courseDimId: uuid('course_dim_id').notNull(),
    day: date('day').notNull(),
    enrolledCount: integer('enrolled_count').notNull().default(0),
    activeCount: integer('active_count').notNull().default(0),
    completionRate: numeric('completion_rate', { precision: 6, scale: 2 }),
    averageGrade: numeric('average_grade', { precision: 6, scale: 2 }),
    /** Ungraded submissions pending, used for teacher SLA tracking. */
    pendingGrades: integer('pending_grades').notNull().default(0),
  },
  (table) => ({
    uniqueSnapshot: uniqueIndex('fact_course_snapshot_unique').on(table.courseDimId, table.day),
    byDay: index('fact_course_snapshot_day_idx').on(table.moodleInstanceId, table.day),
  }),
);

/**
 * Daily risk snapshot. Append-only with a `model_version`, so a scoring change
 * never silently rewrites history and an old score stays explainable against the
 * factors recorded with it.
 */
export const factUserRiskDaily = dw.table(
  'fact_user_risk_daily',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    moodleInstanceId: uuid('moodle_instance_id').notNull(),
    userDimId: uuid('user_dim_id').notNull(),
    courseDimId: uuid('course_dim_id'),
    day: date('day').notNull(),
    score: integer('score').notNull(),
    band: text('band').notNull(),
    /** Human-readable contributions; shown verbatim so the score is not a black box. */
    factors: jsonb('factors').notNull(),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueDay: uniqueIndex('fact_user_risk_daily_unique').on(table.userDimId, table.day),
    byBand: index('fact_user_risk_band_idx').on(table.moodleInstanceId, table.day, table.band),
  }),
);