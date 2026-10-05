import {
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  jsonb,
  uniqueIndex,
  index,
  primaryKey,
  pgSchema,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Control plane schema (`mcc`).
 *
 * Source of truth for tenants, identities, RBAC, Moodle connections, plans,
 * jobs, workflows and audit. Academic data lives in `dw` and is derived from
 * Moodle — never written here.
 *
 * Every tenant-scoped table carries `tenant_id` AND enables RLS. The two are
 * redundant on purpose: `tenant_id` makes queries indexable and auditable, RLS
 * makes a forgotten WHERE clause a non-event instead of a data breach.
 */

/** Explicit schema: the runtime role has no CREATE on `public`. */
export const mccSchema = pgSchema('mcc');

export const tenantStatus = mccSchema.enum('tenant_status', ['active', 'suspended', 'trial']);
export const userStatus = mccSchema.enum('user_status', ['active', 'invited', 'disabled', 'locked']);
export const moodleStatus = mccSchema.enum('moodle_status', ['active', 'disabled', 'error']);
export const probeStatus = mccSchema.enum('probe_status', ['ok', 'degraded', 'down', 'never']);
export const planStatus = mccSchema.enum('plan_status', [
  'draft',
  'previewed',
  'awaiting_approval',
  'approved',
  'executing',
  'completed',
  'completed_with_errors',
  'cancelled',
  'failed',
]);
export const itemState = mccSchema.enum('item_state', [
  'pending',
  'running',
  'done',
  'failed',
  'skipped',
  'conflict',
  'unknown',
]);
export const jobStatus = mccSchema.enum('job_status', [
  'queued',
  'running',
  'paused',
  'completed',
  'completed_with_errors',
  'failed',
  'cancelled',
  'blocked',
]);

export const tenants = mccSchema.table(
  'tenants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    status: tenantStatus('status').notNull().default('trial'),
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('es'),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    slugUnique: uniqueIndex('tenants_slug_unique').on(table.slug),
  }),
);

export const users = mccSchema.table(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Argon2id hash. Nullable only while the user is in `invited` state. */
    passwordHash: text('password_hash'),
    status: userStatus('status').notNull().default('invited'),
    locale: text('locale').notNull().default('es'),
    timezone: text('timezone').notNull().default('UTC'),
    /** MFA is prepared but gated by feature flag. */
    mfaEnabled: boolean('mfa_enabled').notNull().default(false),
    mfaSecretCiphertext: text('mfa_secret_ciphertext'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    preferences: jsonb('preferences').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_unique').on(sql`lower(${table.email})`),
  }),
);

export const tenantMembers = mccSchema.table(
  'tenant_members',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: userStatus('status').notNull().default('active'),
    invitedAt: timestamp('invited_at', { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.userId] }),
  }),
);

/**
 * Role assignments. `scope_type='tenant'` applies tenant-wide; `moodle_instance`
 * restricts the role to a single Moodle, which is what makes multi-Moodle
 * delegation useful.
 */
export const userRoles = mccSchema.table(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    roleKey: text('role_key').notNull(),
    scopeType: text('scope_type').notNull().default('tenant'),
    scopeId: uuid('scope_id'),
    grantedBy: uuid('granted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueAssignment: uniqueIndex('user_roles_unique').on(
      table.userId,
      table.tenantId,
      table.roleKey,
      table.scopeType,
      sql`coalesce(${table.scopeId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
    ),
    byTenant: index('user_roles_tenant_idx').on(table.tenantId),
  }),
);

export const rolePermissions = mccSchema.table(
  'role_permissions',
  {
    roleKey: text('role_key').notNull(),
    permissionKey: text('permission_key').notNull(),
    /** false = explicit deny, which wins over any allow. */
    granted: boolean('granted').notNull().default(true),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleKey, table.permissionKey] }),
  }),
);

/**
 * Moodle instances. The token itself lives in `moodle_credentials`, never here,
 * so this table can be read and cached freely.
 */
export const moodleInstances = mccSchema.table(
  'moodle_instances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    baseUrl: text('base_url').notNull(),
    status: moodleStatus('status').notNull().default('active'),
    moodleVersion: text('moodle_version'),
    moodleRelease: text('moodle_release'),
    moodleVersionNumber: integer('moodle_version_number'),
    sitename: text('sitename'),
    rateLimitProfile: text('rate_limit_profile').notNull().default('default'),
    pluginInstalled: boolean('plugin_installed').notNull().default(false),
    lastProbeAt: timestamp('last_probe_at', { withTimezone: true }),
    lastProbeStatus: probeStatus('last_probe_status').notNull().default('never'),
    lastLatencyP50Ms: integer('last_latency_p50_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTenant: index('moodle_instances_tenant_idx').on(table.tenantId),
    tenantName: uniqueIndex('moodle_instances_tenant_name_unique').on(table.tenantId, table.name),
  }),
);

/**
 * Envelope-encrypted credentials. `secret_ciphertext` is AES-256-GCM output
 * under a per-record DEK wrapped by the master key; `key_version` supports
 * online master key rotation. `token_last4` exists purely so a human can
 * identify which token is stored.
 */
export const moodleCredentials = mccSchema.table(
  'moodle_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => moodleInstances.id, { onDelete: 'cascade' }),
    secretCiphertext: text('secret_ciphertext').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    wrappedDek: text('wrapped_dek').notNull(),
    keyVersion: integer('key_version').notNull().default(1),
    tokenLast4: text('token_last4').notNull(),
    serviceName: text('service_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (table) => ({
    instanceUnique: uniqueIndex('moodle_credentials_instance_unique').on(table.instanceId),
  }),
);

/**
 * Capability discovery snapshot per instance. `functions_json` is the raw
 * function list; `functions_hash` lets a re-probe report a diff after a Moodle
 * upgrade instead of silently changing behaviour.
 */
export const moodleCapabilitySnapshots = mccSchema.table(
  'moodle_capability_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => moodleInstances.id, { onDelete: 'cascade' }),
    functionsHash: text('functions_hash').notNull(),
    functionsJson: jsonb('functions_json').notNull(),
    grantedCapabilities: jsonb('granted_capabilities').notNull().default(sql`'[]'::jsonb`),
    deniedCapabilities: jsonb('denied_capabilities').notNull().default(sql`'[]'::jsonb`),
    missingRequired: jsonb('missing_required').notNull().default(sql`'[]'::jsonb`),
    probeAvailable: boolean('probe_available').notNull().default(false),
    addedFunctions: jsonb('added_functions').notNull().default(sql`'[]'::jsonb`),
    removedFunctions: jsonb('removed_functions').notNull().default(sql`'[]'::jsonb`),
    probedAt: timestamp('probed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byInstance: index('moodle_capability_snapshots_instance_idx').on(table.instanceId, table.probedAt),
  }),
);

export const moodleHealthChecks = mccSchema.table(
  'moodle_health_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    instanceId: uuid('instance_id')
      .notNull()
      .references(() => moodleInstances.id, { onDelete: 'cascade' }),
    status: probeStatus('status').notNull(),
    checks: jsonb('checks').notNull(),
    latencyP50Ms: integer('latency_p50_ms').notNull(),
    checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byInstance: index('moodle_health_instance_idx').on(table.instanceId, table.checkedAt),
  }),
);

/** Sessions are server-side so revocation is immediate. */
export const sessions = mccSchema.table(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    /** Groups a token family so reuse detection can revoke the whole chain. */
    familyId: uuid('family_id').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byUser: index('sessions_user_idx').on(table.userId, table.revokedAt),
    familyIdx: index('sessions_family_idx').on(table.familyId),
    hashUnique: uniqueIndex('sessions_refresh_hash_unique').on(table.refreshTokenHash),
  }),
);

export const passwordResetTokens = mccSchema.table(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashUnique: uniqueIndex('password_reset_hash_unique').on(table.tokenHash),
  }),
);

/** Throttling source of truth; Redis mirrors it for fast rejection. */
export const loginAttempts = mccSchema.table(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    tenantSlug: text('tenant_slug'),
    ipAddress: text('ip_address').notNull(),
    successful: boolean('successful').notNull(),
    failureReason: text('failure_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byEmail: index('login_attempts_email_idx').on(table.email, table.createdAt),
    byIp: index('login_attempts_ip_idx').on(table.ipAddress, table.createdAt),
  }),
);

/**
 * Operation plans. `items` is stored separately in `plan_items` to keep the
 * plan header cheap to read while a 10k-item plan streams through execution.
 */
export const operationPlans = mccSchema.table(
  'operation_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    moodleInstanceId: uuid('moodle_instance_id').references(() => moodleInstances.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').notNull(),
    status: planStatus('status').notNull().default('draft'),
    options: jsonb('options').notNull(),
    policy: jsonb('policy').notNull(),
    origin: text('origin').notNull().default('ui'),
    idempotencyKey: text('idempotency_key'),
    preview: jsonb('preview'),
    /** Hash of the item set; detects drift between preview and execution. */
    previewHash: text('preview_hash'),
    previewedAt: timestamp('previewed_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'restrict' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTenant: index('operation_plans_tenant_idx').on(table.tenantId, table.createdAt),
    statusIdx: index('operation_plans_status_idx').on(table.tenantId, table.status),
    idempotencyUnique: uniqueIndex('operation_plans_idempotency_unique')
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  }),
);

export const planItems = mccSchema.table(
  'plan_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => operationPlans.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    naturalKey: text('natural_key').notNull(),
    targetType: text('target_type').notNull(),
    moodleId: text('moodle_id'),
    desiredHash: text('desired_hash'),
    desired: jsonb('desired').notNull(),
    state: itemState('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    compensation: jsonb('compensation'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    planOrdinal: uniqueIndex('plan_items_plan_ordinal_unique').on(table.planId, table.ordinal),
    naturalKey: uniqueIndex('plan_items_natural_key_unique').on(table.planId, table.naturalKey),
    resumeIdx: index('plan_items_resume_idx').on(table.planId, table.state, table.ordinal),
  }),
);

/**
 * Durable job record. BullMQ holds the volatile queue state; this table is the
 * auditable progress shown in the Operations Center, so a worker restart never
 * loses what already happened.
 */
export const jobs = mccSchema.table(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id').references(() => operationPlans.id, { onDelete: 'set null' }),
    bullJobId: text('bull_job_id'),
    type: text('type').notNull(),
    queue: text('queue').notNull(),
    status: jobStatus('status').notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    total: integer('total').notNull().default(0),
    processed: integer('processed').notNull().default(0),
    succeeded: integer('succeeded').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    skipped: integer('skipped').notNull().default(0),
    /** Resume point; a restarted worker continues rather than restarts. */
    checkpointCursor: integer('checkpoint_cursor').notNull().default(0),
    params: jsonb('params').notNull().default(sql`'{}'::jsonb`),
    result: jsonb('result'),
    /** Set when a circuit breaker or missing capability blocks execution. */
    blockedReason: text('blocked_reason'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTenant: index('jobs_tenant_idx').on(table.tenantId, table.createdAt),
    statusIdx: index('jobs_status_idx').on(table.tenantId, table.status, table.createdAt),
    bullUnique: uniqueIndex('jobs_bull_unique')
      .on(table.bullJobId)
      .where(sql`${table.bullJobId} is not null`),
  }),
);

export const jobErrors = mccSchema.table(
  'job_errors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    itemOrdinal: integer('item_ordinal'),
    naturalKey: text('natural_key'),
    code: text('code').notNull(),
    message: text('message').notNull(),
    remediation: jsonb('remediation'),
    /** Full technical payload; never returned by the API. */
    debugContext: jsonb('debug_context'),
    attempts: integer('attempts').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byJob: index('job_errors_job_idx').on(table.jobId, table.createdAt),
  }),
);

/**
 * Append-only audit log. Append-only is enforced by database grants (no UPDATE
 * or DELETE privilege for the app role), not by application code. `prev_hash`
 * chains rows so tampering is detectable.
 */
export const auditLogs = mccSchema.table(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'restrict' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorEmail: text('actor_email'),
    moodleInstanceId: uuid('moodle_instance_id').references(() => moodleInstances.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    requestId: text('request_id').notNull(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    planId: uuid('plan_id').references(() => operationPlans.id, { onDelete: 'set null' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    result: text('result').notNull().default('success'),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
    rowHash: text('row_hash').notNull(),
    prevHash: text('prev_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTenant: index('audit_logs_tenant_idx').on(table.tenantId, table.createdAt),
    byActor: index('audit_logs_actor_idx').on(table.actorId, table.createdAt),
    byResource: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
    byAction: index('audit_logs_action_idx').on(table.action, table.createdAt),
  }),
);

/**
 * Transactional outbox. Domain writes and their event intent are committed in
 * one transaction; the dispatcher publishes afterwards. Avoids the "operation
 * committed but event lost" failure that breaks workflows and notifications.
 */
export const outbox = mccSchema.table(
  'outbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    payload: jsonb('payload').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    unpublished: index('outbox_unpublished_idx').on(table.publishedAt).where(sql`${table.publishedAt} is null`),
  }),
);

/** Per-entity sync watermarks; `last_full_at` powers the staleness badge. */
export const syncState = mccSchema.table(
  'sync_state',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moodleInstanceId: uuid('moodle_instance_id')
      .notNull()
      .references(() => moodleInstances.id, { onDelete: 'cascade' }),
    entity: text('entity').notNull(),
    cursor: text('cursor'),
    lastFullAt: timestamp('last_full_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    rowsProcessed: integer('rows_processed').notNull().default(0),
    rowsCreated: integer('rows_created').notNull().default(0),
    rowsUpdated: integer('rows_updated').notNull().default(0),
    rowsDeleted: integer('rows_deleted').notNull().default(0),
    rowsErrored: integer('rows_errored').notNull().default(0),
    avgLagSeconds: integer('avg_lag_seconds'),
    etag: text('etag'),
    lastError: text('last_error'),
  },
  (table) => ({
    uniqueEntity: uniqueIndex('sync_state_instance_entity_unique').on(
      table.moodleInstanceId,
      table.entity,
    ),
  }),
);

export const syncRuns = mccSchema.table(
  'sync_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moodleInstanceId: uuid('moodle_instance_id')
      .notNull()
      .references(() => moodleInstances.id, { onDelete: 'cascade' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    entity: text('entity').notNull(),
    mode: text('mode').notNull(),
    recordsProcessed: integer('records_processed').notNull().default(0),
    created: integer('created').notNull().default(0),
    updated: integer('updated').notNull().default(0),
    deleted: integer('deleted').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => ({
    byInstance: index('sync_runs_instance_idx').on(table.moodleInstanceId, table.startedAt),
  }),
);

export const systemSettings = mccSchema.table('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantSettings = mccSchema.table(
  'tenant_settings',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.key] }),
  }),
);

/**
 * Notification outbox for the in-app inbox. Channel-specific delivery rows live
 * in `notification_deliveries`; this table keeps one row per user-facing
 * notification so an event never fans out into a duplicate inbox entry.
 */
export const notifications = mccSchema.table(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    topic: text('topic').notNull(),
    severity: text('severity').notNull().default('info'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    resourceType: text('resource_type'),
    resourceId: text('resource_id'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byUser: index('notifications_user_idx').on(table.userId, table.readAt, table.createdAt),
  }),
);

export const apiKeys = mccSchema.table(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Only the hash is stored; the plaintext is shown once at creation. */
    keyHash: text('key_hash').notNull(),
    keyPrefix: text('key_prefix').notNull(),
    scopes: jsonb('scopes').notNull().default(sql`'[]'::jsonb`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    hashUnique: uniqueIndex('api_keys_hash_unique').on(table.keyHash),
    byTenant: index('api_keys_tenant_idx').on(table.tenantId),
  }),
);

export const apiCallLog = mccSchema.table(
  'api_call_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    moodleInstanceId: uuid('moodle_instance_id').references(() => moodleInstances.id, {
      onDelete: 'set null',
    }),
    fn: text('fn').notNull(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    requestId: text('request_id'),
    durationMs: integer('duration_ms').notNull(),
    statusCode: integer('status_code'),
    ok: boolean('ok').notNull(),
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byInstance: index('api_call_log_instance_idx').on(
      table.moodleInstanceId,
      table.createdAt,
    ),
    byFn: index('api_call_log_fn_idx').on(table.fn, table.createdAt),
  }),
);