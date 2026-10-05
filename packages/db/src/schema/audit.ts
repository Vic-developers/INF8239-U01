import { pgSchema, uuid, text, timestamp, jsonb, bigint, index } from 'drizzle-orm/pg-core';

/**
 * Audit schema (`audit`).
 *
 * Physically separate from `mcc` so audit retention and backup policy can
 * differ from operational data. The application role receives INSERT and SELECT
 * only; UPDATE and DELETE are revoked, which is what makes the log
 * append-only at the database level rather than by convention.
 */
export const audit = pgSchema('audit');

export const auditLogs = audit.table(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id'),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    moodleInstanceId: uuid('moodle_instance_id'),
    /** Dotted action, e.g. `moodle.instance.created`, `plan.approved`. */
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    requestId: text('request_id').notNull(),
    jobId: uuid('job_id'),
    planId: uuid('plan_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    /** success | failure | denied */
    result: text('result').notNull().default('success'),
    before: jsonb('before'),
    after: jsonb('after'),
    metadata: jsonb('metadata'),
    /**
     * SHA-256 over the row payload plus `prev_hash`. Any edit to an earlier row
     * breaks every hash after it, so tampering is detectable without a trusted
     * third party.
     */
    rowHash: text('row_hash').notNull(),
    prevHash: text('prev_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    byTenantTime: index('audit_logs_tenant_time_idx').on(table.tenantId, table.createdAt),
    byActorTime: index('audit_logs_actor_time_idx').on(table.actorId, table.createdAt),
    byResource: index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
    byActionTime: index('audit_logs_action_time_idx').on(table.action, table.createdAt),
    byRequest: index('audit_logs_request_idx').on(table.requestId),
  }),
);

/**
 * Monotonic sequence used to order rows within a tenant when timestamps collide.
 * Kept separate from the log so partitioning never rewrites it.
 */
export const auditSequence = audit.table('audit_sequence', {
  tenantId: uuid('tenant_id').primaryKey(),
  lastHash: text('last_hash'),
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
});

export const auditPartitionMaintenance = audit.table('audit_partition_maintenance', {
  id: uuid('id').primaryKey().defaultRandom(),
  partitionMonth: text('partition_month').notNull(),
  rowsArchived: bigint('rows_archived', { mode: 'number' }).notNull().default(0),
  hashRoot: text('hash_root'),
  archivedAt: timestamp('archived_at', { withTimezone: true }).notNull().defaultNow(),
});

export const RLS_TABLES = [
  'mcc.tenants',
  'mcc.users',
  'mcc.tenant_members',
  'mcc.user_roles',
  'mcc.role_permissions',
  'mcc.moodle_instances',
  'mcc.moodle_credentials',
  'mcc.moodle_capability_snapshots',
  'mcc.moodle_health_checks',
  'mcc.sessions',
  'mcc.password_reset_tokens',
  'mcc.login_attempts',
  'mcc.operation_plans',
  'mcc.plan_items',
  'mcc.jobs',
  'mcc.job_errors',
  'mcc.outbox',
  'mcc.sync_state',
  'mcc.sync_runs',
  'mcc.system_settings',
  'mcc.tenant_settings',
  'mcc.notifications',
  'mcc.api_keys',
  'mcc.api_call_log',
  'audit.audit_logs',
  'dw.dim_moodle_instance',
  'dw.dim_user',
  'dw.dim_category',
  'dw.dim_period',
  'dw.dim_course',
  'dw.dim_activity',
  'dw.dim_cohort',
  'dw.dim_group',
  'dw.fact_enrolment',
  'dw.fact_grade',
  'dw.fact_completion',
  'dw.fact_access_daily',
  'dw.fact_course_snapshot',
  'dw.fact_user_risk_daily',
] as const;

/** Statements executed after DDL to make every tenant-scoped table isolated. */
export function rlsStatements(): string[] {
  const statements: string[] = [];

  for (const table of RLS_TABLES) {
    statements.push(
      `alter table ${table} enable row level security;`,
      `alter table ${table} force row level security;`,
      // The app role must own no BYPASSRLS, otherwise FORCE is meaningless.
      `do $$
      begin
        if exists (
          select 1 from pg_roles where rolname = current_user and rolbypassrls
        ) then
          raise exception 'role % has BYPASSRLS; tenant isolation would be void', current_user;
        end if;
      end
      $$;`,
      `drop policy if exists tenant_isolation on ${table};`,
      `create policy tenant_isolation on ${table}
         using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
         with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);`,
    );
  }

  // Tables without a tenant_id column (tenants.id itself, shared catalogues)
  // need an id-based policy instead.
  statements.push(
    `drop policy if exists tenant_isolation on mcc.tenants;`,
    `create policy tenant_isolation on mcc.tenants
       using (id = nullif(current_setting('app.tenant_id', true), '')::uuid)
       with check (id = nullif(current_setting('app.tenant_id', true), '')::uuid);`,
    `drop policy if exists tenant_isolation on audit.audit_sequence;`,
    `create policy tenant_isolation on audit.audit_sequence
       using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
       with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);`,
    // `users` is global (one identity may belong to several tenants), so the
    // policy is membership-based rather than a tenant_id comparison.
    `drop policy if exists tenant_isolation on mcc.users;`,
    `create policy users_via_membership on mcc.users
       using (
         exists (
           select 1
           from mcc.tenant_members tm
           where tm.user_id = users.id
             and tm.tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
         )
       );`,
    `drop policy if exists tenant_isolation on mcc.role_permissions;`,
    `create policy role_permissions_readonly on mcc.role_permissions
       using (current_setting('app.tenant_id', true) is not null)
       with check (false);`,
    `drop policy if exists tenant_isolation on mcc.system_settings;`,
    `create policy system_settings_readonly on mcc.system_settings
       using (current_setting('app.tenant_id', true) is not null)
       with check (false);`,
    `drop policy if exists tenant_isolation on mcc.login_attempts;`,
    `create policy login_attempts_readonly on mcc.login_attempts
       using (current_setting('app.tenant_id', true) is not null)
       with check (false);`,
  );

  return statements;
}

/** Audit grants: append-only enforced by privilege, not convention. */
export function auditGrantStatements(): string[] {
  return [
    // Table owner retains full rights for migrations; the app role does not.
    `revoke update, delete, truncate on audit.audit_logs from public;`,
    `comment on table audit.audit_logs is
       'Append-only. UPDATE/DELETE revoked for the application role; rows are hash-chained via prev_hash/row_hash.';`,
    `comment on table dw.fact_user_risk_daily is
       'Daily student risk snapshots. Append-only with model_version; a score is never silently recomputed over history.';`,
  ];
}

